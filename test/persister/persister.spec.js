/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const IPFS = require('ipfs')
const MemoryDatastore = require('interface-datastore').MemoryDatastore
const crypto = require('libp2p-crypto')
const Store = require('../../src/collaboration/store')
const Shared = require('../../src/collaboration/shared')
const generateKeys = require('../../src/keys/generate')
const sharedCrypto = require('../../src/common/shared-crypto')
const createTempRepo = require('../utils/repo')
const persister = require('../../src/persister')
const { MemoryNaming, MemoryPersistence } = require('./memory-impl')

require('../utils/fake-crdt')
const Type = require('../../src/collaboration/crdt')('fake')

const suiteOptions = {
  // naming: new MemoryNaming(),
  // persistence: new MemoryPersistence(),
}

// Needed for IPNS
const ipfsOptions = {
  pass: 'some passphrase goes here'
}

let createCollab
describe('persister', function () {
  this.timeout(10000)

  let keys
  let collab1, firstPersister, firstIpfs
  let collab2, secondPersister, secondIpfs

  before(async () => {
    // We need to use an RSA key to be able to import it for IPNS
    keys = await generateKeys({
      algo: 'rsa', bits: 2048
    })
    createCollab = (id) => createCollabWithKeys(id, keys)
  })

  it('creates persister', async () => {
    firstIpfs = await createIpfs()
    collab1 = await createCollab('first')
    const persisterOptions = getPersisterOptions(keys, suiteOptions)
    firstPersister = persister(firstIpfs, collab1.name, Type, collab1.store, persisterOptions)
  })

  it('persister latest state is not yet defined', async () => {
    const state = await firstPersister.fetchLatestState()
    expect(state).not.to.exist()
  })

  it('starts persister', async () => {
    await firstPersister.start(true)
  })

  it('persister latest state is now the empty state', async () => {
    const state = await firstPersister.fetchLatestState()
    expect(state).to.exist()
    expect(state.clock).to.be.empty()
    expect(await getStateValue(state.state)).to.equal('')
  })

  it('mutates state', async () => {
    await addDeltasAndAwaitPropagation(collab1, firstPersister, ['a', 'b', 'c'])
  })

  it('persister latest state is now the join of the deltas', async () => {
    const state = await firstPersister.fetchLatestState()
    expect(state).to.exist()
    expect(await getStateValue(state.state)).to.equal('abc')
  })

  it('mutates state until a snapshot is triggered', async () => {
    // The persistence heuristic has maxDeltas: 3
    // We've already added three deltas, so after
    // adding one more it should trigger a snapshot
    // to be saved
    await addDeltasAndAwaitPropagation(collab1, firstPersister, ['d'])
  })

  it('persister latest state is now just the snapshot', async () => {
    const state = await firstPersister.fetchLatestState()
    expect(state).to.exist()
    expect(await getStateValue(state.state)).to.equal('abcd')
  })

  it('mutates state to add more deltas', async () => {
    await addDeltasAndAwaitPropagation(collab1, firstPersister, ['e', 'f'])
  })

  it('persister latest state is now the snapshot plus new deltas', async () => {
    const state = await firstPersister.fetchLatestState()
    expect(state).to.exist()
    expect(await getStateValue(state.state)).to.equal('abcdef')
  })

  it('stops first persister', async () => {
    await firstPersister.stop()
    await firstIpfs.stop()
  })

  it('creates second persister', async () => {
    secondIpfs = await createIpfs()
    collab2 = await createCollab('second')
    const persisterOptions = getPersisterOptions(keys, suiteOptions)
    secondPersister = persister(secondIpfs, collab2.name, Type, collab2.store, persisterOptions)
  })

  it('adds some local state to second replica', () => {
    collab2.shared.add('g')
    collab2.shared.add('h')
  })

  it('second persister latest state before start is same as first persister state', async () => {
    const state = await secondPersister.fetchLatestState()
    expect(state).to.exist()
    expect(await getStateValue(state.state)).to.equal('abcdef')
  })

  it('merges second persister latest state with second replicas local state', async () => {
    const state = await secondPersister.fetchLatestState()
    await collab2.store.saveDelta([null, state.clock, state.state])
    expect(collab2.shared.value()).to.equal('abcdefgh')
  })

  it('starts second persister', async () => {
    await secondPersister.start(true)
  })

  it('after startup, second replica local state is reflected in persister', async () => {
    const state = await secondPersister.fetchLatestState()
    expect(state).to.exist()
    expect(await getStateValue(state.state)).to.equal('abcdefgh')
  })

  it('mutates state', async () => {
    await addDeltasAndAwaitPropagation(collab2, secondPersister, ['i', 'j'])
  })

  it('second persister latest state now has new deltas', async () => {
    const state = await secondPersister.fetchLatestState()
    expect(state).to.exist()
    expect(await getStateValue(state.state)).to.equal('abcdefghij')
  })

  it('stops second persister', async () => {
    await secondPersister.stop()
    await secondIpfs.stop()
  })
})

async function createCollabWithKeys (id, keys) {
  const ipfs = {
    id () {
      return { id }
    },
    _repo: {
      datastore: new MemoryDatastore()
    }
  }

  const collabName = 'persister test'
  const c = {
    name: collabName
  }

  const key = crypto.randomBytes(16)
  const iv = crypto.randomBytes(16)
  const storeOptions = {
    maxDeltaRetention: 0,
    deltaTrimTimeoutMS: 0,
    createCipher: () => {
      return new Promise((resolve, reject) => {
        crypto.aes.create(Buffer.from(key), Buffer.from(iv), (err, key) => {
          if (err) {
            return reject(err)
          }
          resolve(key)
        })
      })
    }
  }
  const store = new Store(ipfs, c, storeOptions)
  c.store = store
  c.store.on('error', err => console.error('Error from %s store', id, err))
  await store.start()

  const shared = await Shared(null, id, Type, c, store, keys)
  shared.on('error', err => console.error('Error from %s shared', id, err))
  c.shared = shared
  c.store.setShared(shared)
  return c
}

function getPersisterOptions (keys, opts) {
  return Object.assign({}, {
    ipns: {
      key: keys.write
    },
    ipfs: ipfsOptions,
    persistenceHeuristicOptions: {
      maxDeltas: 3
    },
    decryptAndVerify: (data) => sharedCrypto.decryptAndVerify(keys, data),
    signAndEncrypt: (data) => sharedCrypto.signAndEncrypt(keys, data)
  }, opts)
}

let ipfsRepo
const createIpfs = async () => {
  // Naming and persistence are already supplied, so we don't need ipfs
  if (suiteOptions.naming && suiteOptions.persistence) {
    return {
      stop: () => {}
    }
  }

  // Repo must be shared for IPNS to work
  ipfsRepo = ipfsRepo || createTempRepo()

  const sharedIpfs = new IPFS(Object.assign({}, ipfsOptions, { repo: ipfsRepo }))
  sharedIpfs.on('error', console.error)
  await new Promise(resolve => sharedIpfs.isOnline() ? resolve() : sharedIpfs.once('ready', resolve))
  return sharedIpfs
}

async function getStateValue (state) {
  const tmp = await createCollab('tmp' + Math.random())
  await tmp.store.saveDelta([null, null, state])
  return tmp.shared.value()
}

function addDeltasAndAwaitPropagation (collab, persister, values) {
  return new Promise(resolve => {
    // Wait for all the deltas to be processed
    const onBranchDeltaCount = async (count, cid) => {
      if (count >= values.length) {
        persister.removeListener('branch delta count', onBranchDeltaCount)

        // Wait for the HEAD to be updated with the last delta
        const onPublish = async (pubCid) => {
          if (pubCid.equals(cid)) {
            // Wait for the queue to be idle
            await persister.onIdle()
            resolve()
            persister.removeListener('publish', onPublish)
          }
        }
        persister.on('publish', onPublish)
      }
    }
    persister.on('branch delta count', onBranchDeltaCount)

    // Sequentially add values, waiting for each to create a separate delta
    let i = 0
    const onDelta = () => {
      if (i < values.length) {
        collab.shared.add(values[i])
        i++
      } else {
        collab.store.removeListener('delta', onDelta)
      }
    }
    collab.store.on('delta', onDelta)
    onDelta()
  })
}

process.on('unhandledRejection', (err) => {
  console.error(err)
})

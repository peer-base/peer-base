/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const MemoryDatastore = require('interface-datastore').MemoryDatastore
const crypto = require('libp2p-crypto')

const Shared = require('../src/collaboration/shared')
const Store = require('../src/collaboration/store')
const CRDT = require('../src/collaboration/crdt')
require('./utils/fake-crdt')

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

describe('shared', () => {
  let shared

  it('can be created', async () => {
    const ipfs = {
      id () {
        return {
          id: 'replica id'
        }
      },
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = {
      name: 'shared test collaboration'
    }
    const store = new Store(ipfs, collaboration, storeOptions)
    await store.start()
    shared = await Shared('replica id', CRDT('fake'), store)
    store.setShared(shared)
  })

  it('can endure some actions', () => {
    shared.add('a')
    shared.add('b')
  })

  it('waits a bit', (done) => {
    setTimeout(done, 500)
  })

  it('has the correct value', () => {
    expect(shared.value()).to.equal('ab')
  })
})

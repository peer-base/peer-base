/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const CRDT = require('../src/collaboration/crdt')
const Repo = require('./utils/repo')
const Clocks = require('../src/collaboration/clocks')
const Shared = require('../src/collaboration/shared')
const transmit = require('./utils/transmit')

describe('shared delta batches', () => {
  let ipfs
  let shared
  let commonDeltas

  before(async () => {
    const { shared: _shared, ipfs: _ipfs } = await createShared('id')
    ipfs = _ipfs
    shared = _shared
  })

  after(() => ipfs._repo.teardown())

  after(() => shared.stop())

  before(() => {
    const replica1 = CRDT('rga')('replica 1')
    const replica2 = CRDT('rga')('replica 2')

    commonDeltas = [
      [{}, { a: 1 }, [null, 'rga', replica1.push('a')]],
      [{}, { b: 1 }, [null, 'rga', replica2.push('b')]],
    ]

    const moreDeltas = [
      [{ a: 1 }, { a: 1 }, [null, 'rga', replica1.push('c')]],
      [{ b: 1 }, { b: 1 }, [null, 'rga', replica2.push('d')]]
    ]
    for (let delta of commonDeltas.concat(moreDeltas)) {
      // making sure the deltas are accepted
      expect(shared.apply(transmit(delta))).to.exist()
    }
  })

  it('returns correct batches', () => {
    const replica = CRDT('rga')('read only replica')
    for (let deltaRecord of commonDeltas) {
      const [, , [, , delta]] = deltaRecord
      replica.apply(transmit(delta))
    }
    expect(replica.value()).to.deep.equal(['b', 'a'])

    const deltas = shared.deltaBatches({a:1, b:1})

    expect(deltas.length).to.equal(2)
    for (let deltaRecord of deltas) {
      const [fromClock, authorClock] = deltaRecord
      for (let key of Object.keys(fromClock)) {
        expect(fromClock[key]).to.not.equal(0)
      }
    }
  })
})

describe.only('three replicas', () => {
  const replicas = 3
  const peers = []

  before(async () => {
    for (let i = 1; i <= 3; i++) {
      peers[i] = await createShared(`id${i}`)
    }
  })

  after(() => {
    for (let i = 1; i <= 3; i++) {
      peers[i].ipfs._repo.teardown()
    }
  })

  after(() => {
    for (let i = 1; i <= 3; i++) {
      peers[i].shared.stop()
    }
  })

  before(async () => {
    /*
    const replica1 = CRDT('rga')('replica 1')
    const replica2 = CRDT('rga')('replica 2')


    commonDeltas = [
      [{}, { a: 1 }, [null, 'rga', replica1.push('a')]],
      [{}, { b: 1 }, [null, 'rga', replica2.push('b')]],
    ]

    const moreDeltas = [
      [{ a: 1 }, { a: 1 }, [null, 'rga', replica1.push('c')]],
      [{ b: 1 }, { b: 1 }, [null, 'rga', replica2.push('d')]]
    ]
    for (let delta of commonDeltas.concat(moreDeltas)) {
      // making sure the deltas are accepted
      expect(shared.apply(transmit(delta))).to.exist()
    }
    */
  })

  it('converges on all peers', async () => {
    // push 'a' on peer 1
    let clock1a
    peers[1].shared.once('clock changed', clock => clock1a = clock)
    await peers[1].shared.push('a')
    console.log('Jim1-a', peers[1].shared.value().join(''), clock1a)

    // sync peer 1 => peer 2 and push 'bc'
    const batches1a = peers[1].shared.deltaBatches({})
    let clock2abc
    for (let batch of transmit(batches1a)) {
      peers[2].shared.apply(batch)
    }
    await peers[2].shared.push('b')
    peers[2].shared.once('clock changed', clock => clock2abc = clock)
    await peers[2].shared.push('c')
    console.log('Jim2-abc', peers[2].shared.value().join(''), clock2abc)

    // sync peer 2 => peer 1
    const batches2bc = peers[2].shared.deltaBatches(clock1a)
    console.log('Jim batches2bc', batches2bc)
    let clock1abc
    for (let batch of transmit(batches2bc)) {
      peers[1].shared.once('clock changed', clock => clock1abc = clock)
      peers[1].shared.apply(batch)
    }
    console.log('Jim1-abc', peers[1].shared.value().join(''), clock1abc)

    // sync peer 1 => peer 3
    const batches1abc = peers[1].shared.deltaBatches({})
    console.log('Jim batches1abc', batches1abc)
    console.log('Jim2')
    let clock3abc
    for (let batch of transmit(batches1abc)) {
      peers[3].shared.once('clock changed', clock => clock3abc = clock)
      peers[3].shared.apply(batch)
    }
    console.log('Jim3-abc', peers[3].shared.value().join(''), clock3abc)

    /*
    const replica = CRDT('rga')('read only replica')
    for (let deltaRecord of commonDeltas) {
      const [, , [, , delta]] = deltaRecord
      replica.apply(transmit(delta))
    }

    expect(replica.value()).to.deep.equal(['b', 'a'])

    const deltas = shared.deltaBatches({a:1, b:1})

    expect(deltas.length).to.equal(2)
    for (let deltaRecord of deltas) {
      const [fromClock, authorClock] = deltaRecord
      for (let key of Object.keys(fromClock)) {
        expect(fromClock[key]).to.not.equal(0)
      }
    }
    */
  })
})


async function createShared (id) {
  const name = null
  const crdtType = CRDT('rga')
  const repo = Repo()
  const ipfs = {
    _repo: repo
  }
  const collaboration = {
    fqn: () => 'fqn',
    isRoot: () => true
  }
  const clocks = new Clocks(id)
  const options = {}
  const shared = Shared(name, id, crdtType, ipfs, collaboration, clocks, options)
  await startRepo(repo)
  await shared.start()
  return { shared, ipfs }
}

function startRepo (repo) {
  return new Promise((resolve, reject) => {
    repo.init({}, (err) => {
      if (err) {
        return reject(err)
      }

      repo.open((err) => {
        if (err) {
          return reject(err)
        }

        resolve()
      })
    })
  })
}

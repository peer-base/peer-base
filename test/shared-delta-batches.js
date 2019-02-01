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
  const peerIds = ['b', 'c', 'a']

  before(async () => {
    for (let i = 1; i <= 3; i++) {
      peers[i] = await createShared(`id${peerIds[i - 1]}`)
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

  it('converges on all peers', async () => {
    // push '4' on peer 3
    let clock3_4
    peers[3].shared.once('clock changed', clock => clock3_4 = clock)
    await peers[3].shared.push('4')
    console.log('3_4', peers[3].shared.value().join(''), clock3_4)

    // generate batch for peer 3 => peer 1
    const batches3_4 = transmit(peers[3].shared.deltaBatches({}))

    // sync peer 3 => peer 1
    let clock1_4
    for (let batch of batches3_4) {
      peers[1].shared.once('clock changed', clock => clock1_4 = clock)
      peers[1].shared.apply(batch)
    }
    console.log('1_4', peers[1].shared.value().join(''), clock1_4)

    // push '5' on peer 3
    let clock3_45
    peers[3].shared.once('clock changed', clock => clock3_45 = clock)
    await peers[3].shared.push('5')
    console.log('3_45', peers[3].shared.value().join(''), clock3_45)

    // push 'a' on peer 1
    let clock1_4a
    peers[1].shared.once('clock changed', clock => clock1_4a = clock)
    await peers[1].shared.push('a')
    console.log('1_4a', peers[1].shared.value().join(''), clock1_4a)

    // generate batch for peer 3 => peer 1
    const batches3_5 = transmit(peers[3].shared.deltaBatches(clock1_4a))

    // generate batch for peer 1 => peer 3
    const batches1_a = transmit(peers[1].shared.deltaBatches(clock3_45))

    // push '6' on peer 3
    let clock3_456
    peers[3].shared.once('clock changed', clock => clock3_456 = clock)
    await peers[3].shared.push('6')
    console.log('3_456', peers[3].shared.value().join(''), clock3_456)

    // push 'e' on peer 1
    let clock1_4ae
    peers[1].shared.once('clock changed', clock => clock1_4ae = clock)
    await peers[1].shared.push('e')
    console.log('1_4ae', peers[1].shared.value().join(''), clock1_4ae)

    // sync peer 3 => peer 1
    let clock1_4ae5
    for (let batch of batches3_5) {
      peers[1].shared.once('clock changed', clock => clock1_4ae5 = clock)
      peers[1].shared.apply(batch)
    }
    console.log('1_4ae5', peers[1].shared.value().join(''), clock1_4ae5)

    // sync peer 1 => peer 3
    let clock3_4a56
    for (let batch of batches1_a) {
      peers[3].shared.once('clock changed', clock => clock3_4a56 = clock)
      peers[3].shared.apply(batch)
    }
    console.log('3_4a56', peers[3].shared.value().join(''), clock3_4a56)

    // push '7' on peer 3
    let clock3_4a567
    peers[3].shared.once('clock changed', clock => clock3_4a567 = clock)
    await peers[3].shared.push('7')
    console.log('3_4a567', peers[3].shared.value().join(''), clock3_4a567)

    // push 'i' on peer 1
    let clock1_4ae5i
    peers[1].shared.once('clock changed', clock => clock1_4ae5i = clock)
    await peers[1].shared.push('i')
    console.log('1_4ae5i', peers[1].shared.value().join(''), clock1_4ae5i)

    // generate batch for peer 1 => peer 3
    // Note: this only pushed 'i' for some reason in my trace
    const batches1_ei = transmit(peers[1].shared.deltaBatches(clock3_4a56))

    // generate batch for peer 3 => peer 1
    const batches3_ae67 = transmit(peers[3].shared.deltaBatches(clock1_4ae5i))

    // push 'o' on peer 1
    let clock1_4ae5io
    peers[1].shared.once('clock changed', clock => clock1_4ae5io = clock)
    await peers[1].shared.push('o')
    console.log('1_4ae5io', peers[1].shared.value().join(''), clock1_4ae5io)

    // generate batch for peer 1 => peer 3
    const batches1_o = transmit(peers[1].shared.deltaBatches(clock3_4a567))

    // generate batch for peer 3 => peer 2
    const batches3_4ae5io67 = transmit(peers[3].shared.deltaBatches({}))

    // sync peer 3 => peer 1
    let clock1_4ae5io67
    for (let batch of batches3_ae67) {
      // When broken, deltas for 'ae' are not included in batch, only '67'
      peers[1].shared.once('clock changed', clock => clock1_4ae5io67 = clock)
      peers[1].shared.apply(batch)
    }
    console.log('1_4ae5io67', peers[1].shared.value().join(''), clock1_4ae5io67)

    // sync peer 1 => peer 3
    let clock3_4ae5i67
    for (let batch of batches1_ei) {
      peers[3].shared.once('clock changed', clock => clock3_4ae5i67 = clock)
      peers[3].shared.apply(batch)
    }
    console.log('3_4ae5i67', peers[3].shared.value().join(''), clock3_4ae5i67)

    // sync peer 1 => peer 3
    let clock3_4ae5io67
    for (let batch of batches1_o) {
      peers[3].shared.once('clock changed', clock => clock3_4ae5io67 = clock)
      peers[3].shared.apply(batch)
    }
    console.log('3_4ae5io67', peers[3].shared.value().join(''), clock3_4ae5io67)

    // sync peer 3 => peer 2
    let clock2_4ae5io67
    for (let batch of batches3_4ae5io67) {
      // When broken, deltas for 'ae' are not included in batch
      peers[2].shared.once('clock changed', clock => clock2_4ae5io67 = clock)
      peers[2].shared.apply(batch)
    }
    console.log('2_4ae5io67', peers[2].shared.value().join(''), clock2_4ae5io67)

    /*
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
    */

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

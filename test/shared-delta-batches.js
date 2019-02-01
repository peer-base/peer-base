/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const CRDT = require('delta-crdts')
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
      [{}, { b: 1 }, [null, 'rga', replica2.push('b')]]
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

    const deltas = shared.deltaBatches({ a: 1, b: 1 })

    expect(deltas.length).to.equal(2)
    for (let deltaRecord of deltas) {
      const [fromClock] = deltaRecord
      for (let key of Object.keys(fromClock)) {
        expect(fromClock[key]).to.not.equal(0)
      }
    }
  })
})

async function createShared (id) {
  const name = null
  const crdtType = CRDT.type('rga')
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

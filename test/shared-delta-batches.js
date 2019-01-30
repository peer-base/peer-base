/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const CRDT = require('delta-crdts')
const Repo = require('./utils/repo')
const Clocks = require('../src/collaboration/clocks')
const Shared = require('../src/collaboration/shared')
const transmit = require('./utils/transmit')

describe('shared delta batches', () => {
  let ipfs
  let shared

  before(async () => {
    const name = null
    const id = '1234abcdef'
    const crdtType = CRDT.type('rga')
    const repo = Repo()
    ipfs = {
      _repo: repo
    }
    const collaboration = {
      fqn: () => 'fqn',
      isRoot: () => true
    }
    const clocks = new Clocks(id)
    const options = {}
    shared = Shared(name, id, crdtType, ipfs, collaboration, clocks, options)
    await startRepo(repo)
    await shared.start()
  })

  after(() => ipfs._repo.teardown())

  after(() => shared.stop())

  before(() => {
    const replica1 = CRDT('rga')('replica 1')
    const replica2 = CRDT('rga')('replica 2')

    const deltas = [
      [{}, {'a': 1}, [null, 'rga', replica1.push('a')]],
      [{}, {'b': 1}, [null, 'rga', replica2.push('b')]],
      [{a: 1}, {'a': 1}, [null, 'rga', replica1.push('c')]],
      [{b: 1}, {'b': 1}, [null, 'rga', replica2.push('d')]],
    ]
    for (let delta of deltas) {
      expect(shared.apply(delta)).to.exist()
    }
  })

  it('returns correct batches', () => {
    const replica = CRDT('rga')('read only replica')
    const deltas = shared.deltaBatches()
    for (let deltaRecord of deltas) {
      const [, , [, , delta]] = deltaRecord
      replica.apply(transmit(delta))
    }

    expect(replica.value()).to.deep.equal(shared.value())
  })
})

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
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

  it('applies delta', () => {
    const replica = CRDT('rga')('other id')
    const delta = [{}, {'a': 1}, [null, 'rga', replica.push('a')]]
    shared.apply(delta)
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
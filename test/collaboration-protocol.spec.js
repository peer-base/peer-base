/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const pair = require('pull-pair')
const MemoryDatastore = require('interface-datastore').MemoryDatastore

const Store = require('../src/collaboration/store')
const Protocol = require('../src/collaboration/protocol')

// process.on('unhandledRejection', (err) => {
//   console.log(err)
// })

describe('collaboration protocol', function () {
  let pusher = {}
  let puller = {}

  it('pusher can be created', () => {
    const ipfs = {
      id () {
        return { id: 'pusher' }
      },
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = { name: 'collaboration protocol test' }
    pusher.store = new Store(ipfs, collaboration)
    pusher.protocol = Protocol(collaboration, pusher.store)
    return pusher.store.start()
  })

  it('puller can be created', () => {
    const ipfs = {
      id () {
        return { id: 'puller' }
      },
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = { name: 'collaboration protocol test' }
    puller.store = new Store(ipfs, collaboration)
    puller.protocol = Protocol(collaboration, puller.store)
    return puller.store.start()
  })

  it('can connect pusher and puller', () => {
    const p1 = pair()
    const p2 = pair()

    const pullerStream = {
      source: p1.source,
      sink: p2.sink,
      getPeerInfo (cb) {
        setImmediate(() => cb(null, 'pusher'))
      }
    }

    const pusherStream = {
      source: p2.source,
      sink: p1.sink
    }

    pusher.protocol.dialerFor('puller', pusherStream)
    puller.protocol.handler(null, pullerStream)
  })

  it('can push operations', () => {
    return pusher.store.saveState([undefined, 'state 1'])
  })

  it('puller got new state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('state 1')
    })
  })
})

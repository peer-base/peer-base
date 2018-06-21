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
  let pusher2 = {}

  it('pusher can be created', () => {
    const ipfs = {
      id () {
        return { id: 'pusher' }
      },
      _peerInfo: fakePeerInfoFor('pusher'),
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = { name: 'collaboration protocol test' }
    pusher.store = new Store(ipfs, collaboration)
    pusher.protocol = Protocol(ipfs, collaboration, pusher.store)
    return pusher.store.start()
  })

  it('puller can be created', () => {
    const ipfs = {
      id () {
        return { id: 'puller' }
      },
      _peerInfo: fakePeerInfoFor('puller'),
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = { name: 'collaboration protocol test' }
    puller.store = new Store(ipfs, collaboration)
    puller.protocol = Protocol(ipfs, collaboration, puller.store)
    return puller.store.start()
  })

  it('can connect pusher and puller', () => {
    const p1 = pair()
    const p2 = pair()

    const pullerStream = {
      source: p1.source,
      sink: p2.sink,
      getPeerInfo (cb) {
        setImmediate(() => cb(null, fakePeerInfoFor('pusher')))
      }
    }

    const pusherStream = {
      source: p2.source,
      sink: p1.sink
    }

    pusher.protocol.dialerFor(fakePeerInfoFor('puller'), pusherStream)
    puller.protocol.handler(null, pullerStream)
  })

  it('can save state locally', () => {
    return pusher.store.saveState([undefined, 'state 1'])
  })

  it('puller got new state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('state 1')
    })
  })

  it('introduces another pusher', () => {
    const ipfs = {
      id () {
        return { id: 'pusher 2' }
      },
      _peerInfo: fakePeerInfoFor('pusher 2'),
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = { name: 'collaboration protocol test' }
    pusher2.store = new Store(ipfs, collaboration)
    pusher2.protocol = Protocol(ipfs, collaboration, pusher2.store)
    return pusher2.store.start()
  })

  it('connects new pusher to puller', () => {
    const p1 = pair()
    const p2 = pair()

    const pullerStream = {
      source: p1.source,
      sink: p2.sink,
      getPeerInfo (cb) {
        setImmediate(() => cb(null, fakePeerInfoFor('pusher 2')))
      }
    }

    const pusherStream = {
      source: p2.source,
      sink: p1.sink
    }

    pusher2.protocol.dialerFor(fakePeerInfoFor('puller 2'), pusherStream)
    puller.protocol.handler(null, pullerStream)
  })

  it('pusher2 can save state locally', () => {
    return pusher2.store.saveState([undefined, 'state 2'])
  })

  it('waits a bit', (done) => setTimeout(done, 1000))

  it('puller got new state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('state 2')
    })
  })
})

function fakePeerInfoFor (id) {
  return {
    id: {
      toB58String() {
        return id
      }
    }
  }
}
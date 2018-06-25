/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const pair = require('pull-pair')
const MemoryDatastore = require('interface-datastore').MemoryDatastore
const vectorclock = require('vectorclock')

const Store = require('../src/collaboration/store')
const Shared = require('../src/collaboration/shared')
const Protocol = require('../src/collaboration/protocol')

const Type = require('./utils/fake-crdt')

// process.on('unhandledRejection', (err) => {
//   console.log(err)
// })

describe('collaboration protocol', function () {
  const pusher = {}
  const puller = {}
  const pusher2 = {}
  const pusher3 = {}
  const puller2 = {}

  it('pusher can be created', async () => {
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
    await pusher.store.start()
    pusher.protocol = Protocol(ipfs, collaboration, pusher.store)
    pusher.shared = await Shared('pusher', Type, pusher.store)
    pusher.store.setShared(pusher.shared)
  })

  it('puller can be created', async () => {
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
    await puller.store.start()
    puller.protocol = Protocol(ipfs, collaboration, puller.store, {
      receiveTimeout: 500
    })
    puller.shared = await Shared('puller', Type, puller.store)
    puller.store.setShared(puller.shared)
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
    return pusher.shared.add('a')
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('puller got new state', () => {
    expect(puller.shared.value()).to.equal('a')
  })

  it('introduces another pusher', async () => {
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
    await pusher2.store.start()
    pusher2.protocol = Protocol(ipfs, collaboration, pusher2.store)
    pusher2.shared = await Shared('pusher 2', Type, pusher2.store)
    pusher2.store.setShared(pusher2.shared)
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

    pusher2.protocol.dialerFor(fakePeerInfoFor('puller'), pusherStream)
    puller.protocol.handler(null, pullerStream)
  })

  it('pusher2 can save state locally', () => {
    pusher2.shared.add('b')
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('puller got new state', () => {
    expect(puller.shared.value()).to.equal('ab')
  })

  it('pusher1 can save state again', () => {
    pusher.shared.add('c')
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('puller got new state', () => {
    expect(puller.shared.value()).to.equal('abc')
  })

  it('can create pusher from puller store', async () => {
    const ipfs = {
      id () {
        return { id: 'pusher from puller' }
      },
      _peerInfo: fakePeerInfoFor('pusher from puller'),
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = { name: 'collaboration protocol test' }
    pusher3.store = puller.store // same store as puller
    pusher3.protocol = Protocol(ipfs, collaboration, pusher3.store)
    pusher3.shared = await Shared('pusher from puller', Type, pusher3.store)
    pusher3.store.setShared(pusher3.shared)
  })

  it('can create a fresh new puller', async () => {
    const ipfs = {
      id () {
        return { id: 'puller 2' }
      },
      _peerInfo: fakePeerInfoFor('puller 2'),
      _repo: {
        datastore: new MemoryDatastore()
      }
    }
    const collaboration = { name: 'collaboration protocol test' }
    puller2.store = new Store(ipfs, collaboration)
    await puller2.store.start()
    puller2.protocol = Protocol(ipfs, collaboration, puller2.store, {
      receiveTimeout: 500
    })
    puller2.shared = await Shared('puller 2', Type, puller2.store)
    puller2.store.setShared(puller2.shared)
  })

  it('connects last two', () => {
    const p1 = pair()
    const p2 = pair()

    const pullerStream = {
      source: p1.source,
      sink: p2.sink,
      getPeerInfo (cb) {
        setImmediate(() => cb(null, fakePeerInfoFor('pusher from puller')))
      }
    }

    const pusherStream = {
      source: p2.source,
      sink: p1.sink
    }

    pusher3.protocol.dialerFor(fakePeerInfoFor('puller 2'), pusherStream)
    puller2.protocol.handler(null, pullerStream)
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('newest puller got new state', () => {
    expect(puller2.shared.value()).to.equal('abc')
  })

  it('can add duplicate data to pusher 1 and 2', async () => {
    // all connections are on an eager mode
    // force one to go to lazy mode by sending duplicate data
    const latestClock = vectorclock.merge(
      await pusher.store.getLatestClock(),
      await pusher2.store.getLatestClock())

    const nextClock = vectorclock.increment(latestClock, 'some other node id')

    await Promise.all([
      pusher.store.saveState([nextClock, 'd']),
      pusher2.store.saveDelta([nextClock, 'd'])])
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('puller got new state', () => {
    expect(puller.shared.value()).to.equal('abcd')
  })

  it('waits another bit', (done) => setTimeout(done, 1000))

  it('newest puller got new state', () => {
    expect(puller2.shared.value()).to.equal('abcd')
  })

  it('new data happens in lazy mode connection', () => {
    pusher2.shared.add('e')
    pusher.shared.add('f')
  })

  it('puller in lazy mode connection does not still have this state', () => {
    expect(puller.shared.value()).to.equal('abcd')
  })

  it('waits a bit', function (done) {
    setTimeout(done, 1900)
  })

  it('puller eventually got the new state', () => {
    expect(puller.shared.value()).to.equal('abcdef')
  })
})

function fakePeerInfoFor (id) {
  return {
    id: {
      toB58String () {
        return id
      }
    }
  }
}

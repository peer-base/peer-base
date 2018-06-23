/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const pair = require('pull-pair')
const MemoryDatastore = require('interface-datastore').MemoryDatastore
const vectorclock = require('vectorclock')
const uniq = require('lodash.uniq')

const Store = require('../src/collaboration/store')
const Protocol = require('../src/collaboration/protocol')

process.on('unhandledRejection', (err) => {
  console.log(err)
})

function merge (s1, s2) {
  if (typeof s1 !== 'string') {
    throw new Error('need string!')
  }
  console.log('merging %j and %j', s1, s2)
  const result = uniq((s1 + s2).split('')).sort().join('')
  console.log('result:', result)
  return result
}

describe('collaboration protocol', function () {
  const pusher = {}
  const puller = {}
  const pusher2 = {}
  const pusher3 = {}
  const puller2 = {}

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
    pusher.store = new Store(ipfs, collaboration, merge)
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
    puller.store = new Store(ipfs, collaboration, merge)
    puller.protocol = Protocol(ipfs, collaboration, puller.store, {
      receiveTimeout: 500
    })
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
    return pusher.store.saveState([undefined, 'a'])
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('puller got new state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('a')
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
    pusher2.store = new Store(ipfs, collaboration, merge)
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

    pusher2.protocol.dialerFor(fakePeerInfoFor('puller'), pusherStream)
    puller.protocol.handler(null, pullerStream)
  })

  it('pusher2 can save state locally', () => {
    return pusher2.store.saveState([undefined, 'b'])
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('puller got new state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('ab')
    })
  })

  it('pusher1 can save state again', () => {
    return pusher.store.saveState([undefined, 'c'])
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('puller got new state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('abc')
    })
  })

  it('can create pusher from puller store', () => {
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
  })

  it('can create a fresh new puller', () => {
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
    puller2.store = new Store(ipfs, collaboration, merge)
    puller2.protocol = Protocol(ipfs, collaboration, puller2.store)
    return puller2.store.start()
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
    return puller2.store.getState().then((state) => {
      expect(state).to.equal('abc')
    })
  })

  it('can add duplicate data to pusher 1 and 2', async () => {
    // all connections are on an eager mode
    // force one to go to lazy mode by sending duplicate data
    let latestClock = vectorclock.merge(
      await pusher.store.getLatestClock(),
      await pusher2.store.getLatestClock())

    latestClock = vectorclock.increment(latestClock, 'some other node id')
    await Promise.all([
      pusher.store.saveState([latestClock, 'd']),
      pusher2.store.saveState([latestClock, 'd'])])
  })

  it('waits a bit', (done) => setTimeout(done, 500))

  it('newest puller got new state', () => {
    return puller2.store.getState().then((state) => {
      expect(state).to.equal('abcd')
    })
  })

  it('new data happens in lazy mode connection', () => {
    // Now that we have the connection from pusher 2 to puller in lazy mode,
    // let's add some data to pusher 2 to see if it eventually reaches puller
    return pusher2.store.saveState([null, 'e'])
  })

  it('puller in lazy mode connection does not still have this state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('abcd')
    })
  })

  it('waits a bit', function (done) {
    setTimeout(done, 1900)
  })

  it('puller eventually got the new state', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('abcde')
    })
  })

  it('can store a few deltas', () => {
    return Promise.all([
      pusher2.store.saveDelta([null, null, 'f']),
      pusher2.store.saveDelta([null, null, 'g'])])
  })

  it('waits a bit', function (done) {
    setTimeout(done, 1900)
  })

  it('puller got the new delta', () => {
    return puller.store.getState().then((state) => {
      expect(state).to.equal('abcdefg')
    })
  })

  it('puller 2 got the new delta', () => {
    return puller2.store.getState().then((state) => {
      expect(state).to.equal('abcdefg')
    })
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

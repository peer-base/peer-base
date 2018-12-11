/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const fake = require('sinon').fake

const EventEmitter = require('events')

const AppTransport = require('../src/transport/app-transport')
const fail = require('./utils/fail')
const FakePeerInfo = require('./utils/fake-peer-info')

describe('app-transport', function () {
  let appTransport
  let listener = (conn) => {
    // nothing
  }
  let discovery
  let transport
  let ipfs
  let app

  before(() => {
    app = {
      name: 'peer-base test app name',
      setGossip: fake(),
      setGlobalConnectionManager: fake()
    }

    ipfs = {
      _libp2pNode: {
        dial: fake(),
        hangUp: (p, callback) => { setImmediate(() => callback()) },
        pubsub: {
        },
        on: fake()
      },
      pubsub: {
        peers: (topic, cb) => setImmediate(() => cb(null, [])),
        subscribe: (topic, handler, callback) => {
          setImmediate(() => callback())
        }
      },
      _peerInfo: {
        id: {
          toBytes: () => Buffer.from([1, 2])
        }
      }
    }
    discovery = Object.assign(new EventEmitter(), {
      start: fake(),
      stop: fake()
    })
    transport = {
      createListener () {
        // nothing
      },
      discovery: discovery,
      listeners: []
    }
  })

  it('can be created', () => {
    appTransport = AppTransport(app, ipfs, transport, {
      maxThrottleDelayMS: 0,
      debounceResetConnectionsMS: 0,
      preambleByteCount: 0
    })
  })

  it('can create a listener', () => {
    appTransport.createListener(listener)
  })

  describe('filtered discovery', () => {
    before(() => appTransport.discovery.start())

    after(() => appTransport.discovery.stop())

    it('unconnected peer is filtered', function (done) {
      this.timeout(6000)
      let dialCalled = false
      const dial = (peerInfo, callback) => {
        dialCalled = true
        callback(new Error('nope, not today!'))
      }
      ipfs._libp2pNode.dial = dial

      const onPeerDiscovered = fail('should not discover peer')
      appTransport.discovery.on('peer', onPeerDiscovered)
      transport.discovery.emit('peer', new FakePeerInfo([1, 2, 3, 4]))
      setTimeout(() => {
        expect(dialCalled).to.be.true()
        appTransport.discovery.removeListener('peer', onPeerDiscovered)
        done()
      }, 1000)
    })

    it('uninteresting peer is filtered', function (done) {
      this.timeout(6000)
      let dialCalled = false
      const dial = (peerInfo, callback) => {
        dialCalled = true
        setImmediate(callback)
      }
      ipfs._libp2pNode.dial = dial

      const onPeerDiscovered = fail('should not discover peer')
      appTransport.discovery.on('peer', onPeerDiscovered)
      transport.discovery.emit('peer', new FakePeerInfo([3, 4, 5, 6]))
      setTimeout(() => {
        expect(dialCalled).to.be.true()
        appTransport.discovery.removeListener('peer', onPeerDiscovered)
        done()
      }, 5000)
    })

    it('interesting peer is discovered', function (done) {
      this.timeout(6000)
      const dial = (peerInfo, callback) => {
        const peers = []
        ipfs.pubsub.peers = (topic, callback) => {
          callback(null, peers)
        }
        setImmediate(() => {
          setTimeout(() => {
            peers.push('8SxqM')
          }, 2000)
          callback()
        })
      }
      ipfs._libp2pNode.dial = dial

      const onPeerDiscovered = (peerId) => {
        expect(peerId.id.toB58String()).to.equal('8SxqM')
        done()
      }
      appTransport.discovery.once('peer', onPeerDiscovered)
      transport.discovery.emit('peer', new FakePeerInfo([5, 6, 7, 8]))
    })
  })
})

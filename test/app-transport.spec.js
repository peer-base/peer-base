/* eslint-env mocha */
'use strict'

const hat = require('hat')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const fake = require('sinon').fake

const EventEmitter = require('events')
const AppTransport = require('../src/transport/app-transport')
const fail = require('./utils/fail')

describe('app-transport', function () {
  let appTransport
  let listener = (conn) => {
    console.log('listening to conn...')
  }
  let discovery
  let transport
  let ipfs

  before(() => {
    ipfs = {
      _libp2pNode: {
        pubsub: {
        },
        on: fake()
      },
      pubsub: {
        subscribe: (topic, handler, callback) => {
          setImmediate(() => callback())
        }
      }
    }
    discovery = Object.assign(new EventEmitter(), {
      start: fake(),
      stop: fake()
    })
    transport = {
      createListener() {
        // TODO
      },
      discovery: discovery,
      listeners: []
    }
  })

  it('can be created', () => {
    appTransport = AppTransport('peer-star test app name', ipfs, transport)
  })

  it('can create a listener', () => {
    appTransport.createListener(listener)
  })

  describe('filtered discovery', () => {
    before(() => appTransport.discovery.start())

    after(() => appTransport.discovery.stop())

    it('unconnected peer is filtered', function (done) {
      this.timeout(6000)
      const dial = (peerInfo, callback) => {
        callback(new Error('nope, not today!'))
      }
      ipfs._libp2pNode.pubsub._dialPeer = dial

      const onPeerDiscovered = fail('should not discover peer')
      appTransport.discovery.on('peer', onPeerDiscovered)
      transport.discovery.emit('peer', '/ipfs/abcdef')
      setTimeout(() => {
        appTransport.discovery.removeListener('peer', onPeerDiscovered)
        done()
      }, 5000)
    })

    it('uninteresting peer is filtered', function (done) {
      this.timeout(6000)
      const dial = fake()
      ipfs._libp2pNode.pubsub._dialPeer = dial

      const onPeerDiscovered = fail('should not discover peer')
      appTransport.discovery.on('peer', onPeerDiscovered)
      transport.discovery.emit('peer', '/ipfs/abcdef')
      setTimeout(() => {
        expect(dial.callCount).to.be.least(1)
        appTransport.discovery.removeListener('peer', onPeerDiscovered)
        done()
      }, 5000)
    })

    it('interesting peer is discovered', function (done) {
      this.timeout(6000)
      const dial = (peerInfo, callback) => {
        const peers = new Map()
        ipfs._libp2pNode.pubsub.peers = new Map()
        setImmediate(() => {
          setTimeout(() => {
            peers.set('ghijklmn', {
              topics: new Set(['peer-star test app name'])
            })
          }, 2000)
          callback()
        })
      }
      ipfs._libp2pNode.pubsub._dialPeer = dial

      const onPeerDiscovered = (peerId) => {
        expect(peerId.id.toB58String()).to.equal('Qmabcdef')
        done()
      }
      appTransport.discovery.once('peer', onPeerDiscovered)
      transport.discovery.emit('peer', '/ipfs/Qmabcdef')
    })
  })
})

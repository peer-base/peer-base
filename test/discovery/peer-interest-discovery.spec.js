/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const PeerInterestDiscovery = require('../../src/discovery/peer-interest-discovery')
const FakePeerInfo = require('../utils/fake-peer-info')

describe('peer interest discovery', () => {
  it('emits event showing interest in topic', (done) => {
    const floodSub = new EventEmitter()
    const ipfs = {
      _libp2pNode: {
        _floodSub: floodSub
      }
    }
    const appTopic = 'my topic'
    const interestDiscovery = new PeerInterestDiscovery(ipfs, appTopic)
    interestDiscovery.start()

    const events = []
    interestDiscovery.on('peer', (...args) => events.push(args))

    // Emit an event that is interesting
    const peerInfo = new FakePeerInfo('a')
    const topics = new Set(['my topic', 'some other stuff'])
    floodSub.emit('floodsub:subscription-change', peerInfo, topics)

    // Emit an event that is not interesting
    const topics2 = new Set(['other topic', 'some other stuff'])
    floodSub.emit('floodsub:subscription-change', peerInfo, topics2)

    setImmediate(() => {
      expect(events.length).to.equal(2)

      const pi0 = events[0][0]
      const isInterested0 = events[0][1]
      expect(pi0.id.toB58String()).to.equal(peerInfo.id.toB58String())
      expect(isInterested0).to.equal(true)

      const pi1 = events[1][0]
      const isInterested1 = events[1][1]
      expect(pi1.id.toB58String()).to.equal(peerInfo.id.toB58String())
      expect(isInterested1).to.equal(false)

      done()
    })
  })
})

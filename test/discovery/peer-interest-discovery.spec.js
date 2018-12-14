/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const PeerInterestDiscovery = require('../../src/discovery/peer-interest-discovery')
const FakePeerInfo = require('../utils/fake-peer-info')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('peer interest discovery', () => {
  it('emits event showing interest in topic', async () => {
    const { ipfs, floodSub, globalConnMgr } = createSim()
    const appTopic = 'my topic'
    const interestDiscovery = new PeerInterestDiscovery(ipfs, globalConnMgr, appTopic)
    interestDiscovery.start()

    const events = []
    interestDiscovery.on('peer', (...args) => events.push(args))

    // Emit an event that is interesting
    const peerInfo = new FakePeerInfo('a')
    const topics = new Set([appTopic, 'some other stuff'])
    floodSub.emit('floodsub:subscription-change', peerInfo, topics)

    // Emit an event that is not interesting
    const topics2 = new Set(['other topic', 'some other stuff'])
    floodSub.emit('floodsub:subscription-change', peerInfo, topics2)

    await waitFor(0)

    expect(events.length).to.equal(2)

    const pi0 = events[0][0]
    const isInterested0 = events[0][1]
    expect(pi0.id.toB58String()).to.equal(peerInfo.id.toB58String())
    expect(isInterested0).to.equal(true)

    const pi1 = events[1][0]
    const isInterested1 = events[1][1]
    expect(pi1.id.toB58String()).to.equal(peerInfo.id.toB58String())
    expect(isInterested1).to.equal(false)
  })

  it('does not hang up after event showing interest in topic', async () => {
    const { ipfs, floodSub, globalConnMgr, hangups } = createSim()
    const appTopic = 'my topic'
    const interestDiscovery = new PeerInterestDiscovery(ipfs, globalConnMgr, appTopic)
    interestDiscovery.start()

    // Emit an event that is interesting
    const peerInfo = new FakePeerInfo('a')
    const topics = new Set([appTopic, 'some other stuff'])
    floodSub.emit('floodsub:subscription-change', peerInfo, topics)

    await waitFor(0)

    // Timer should have been cleaned up
    expect(interestDiscovery.needsConnection(peerInfo)).to.equal(false)
    // Connection should not have been hung up
    expect(hangups.length).to.equal(0)
  })

  it('hangs up after event showing not interested in topic', async () => {
    const { ipfs, floodSub, globalConnMgr, hangups } = createSim()
    const appTopic = 'my topic'
    const interestDiscovery = new PeerInterestDiscovery(ipfs, globalConnMgr, appTopic)
    interestDiscovery.start()

    // Emit an event that is not interesting
    const peerInfo = new FakePeerInfo('a')
    const topics = new Set(['other topic', 'some other stuff'])
    floodSub.emit('floodsub:subscription-change', peerInfo, topics)

    await waitFor(0)

    // Timer should have been cleaned up
    expect(interestDiscovery.needsConnection(peerInfo)).to.equal(false)
    // Connection should have been hung up
    expect(hangups.length).to.equal(1)
  })

  it('times out after waiting for interest event', async () => {
    const { ipfs, globalConnMgr, hangups } = createSim()
    const appTopic = 'my topic'
    const interestDiscovery = new PeerInterestDiscovery(ipfs, globalConnMgr, appTopic, {
      peerInterestTimeoutMS: 50
    })
    interestDiscovery.start()

    const peerInfo = new FakePeerInfo('a')
    interestDiscovery.add(peerInfo)

    await waitFor(10)
    expect(interestDiscovery.needsConnection(peerInfo)).to.equal(true)

    // Subsequent adds are ignored
    interestDiscovery.add(peerInfo)

    await waitFor(100)

    // Timer should have been cleaned up
    expect(interestDiscovery.needsConnection(peerInfo)).to.equal(false)
    // Connection should have been hung up
    expect(hangups.length).to.equal(1)
  })

  it('aborts timer immediately if the peer is disconnected', async () => {
    const { ipfs, libp2pNode, globalConnMgr, hangups } = createSim()
    const appTopic = 'my topic'
    const interestDiscovery = new PeerInterestDiscovery(ipfs, globalConnMgr, appTopic, {
      peerInterestTimeoutMS: 50
    })
    interestDiscovery.start()

    const peerInfo = new FakePeerInfo('a')
    interestDiscovery.add(peerInfo)

    await waitFor(10)

    libp2pNode.emit('peer:disconnect', peerInfo)

    // Timer should have been cleaned up
    expect(interestDiscovery.needsConnection(peerInfo)).to.equal(false)
    // Connection was already disconnected, so it's not hung up
    expect(hangups.length).to.equal(0)
  })

  it('aborts timers immediately if interest discovery is stopped', async () => {
    const { ipfs, globalConnMgr, hangups } = createSim()
    const appTopic = 'my topic'
    const interestDiscovery = new PeerInterestDiscovery(ipfs, globalConnMgr, appTopic, {
      peerInterestTimeoutMS: 50
    })
    interestDiscovery.start()

    const a = new FakePeerInfo('a')
    const b = new FakePeerInfo('b')
    interestDiscovery.add(a)
    interestDiscovery.add(b)

    await waitFor(10)

    interestDiscovery.stop()

    await waitFor(0)

    // Timers should have been cleaned up
    expect(interestDiscovery.needsConnection(a)).to.equal(false)
    expect(interestDiscovery.needsConnection(b)).to.equal(false)
    // Connections should have been hung up
    expect(hangups.length).to.equal(2)
  })
})

function createSim () {
  const floodSub = new EventEmitter()
  const libp2pNode = new EventEmitter()
  const ipfs = {
    _libp2pNode: Object.assign(libp2pNode, {
      _floodSub: floodSub
    })
  }
  const hangups = []
  const globalConnMgr = {
    maybeHangUp (peerInfo) {
      hangups.push(peerInfo)
    }
  }
  return {
    ipfs,
    libp2pNode,
    floodSub,
    hangups,
    globalConnMgr
  }
}

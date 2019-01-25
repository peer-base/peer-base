/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const delay = require('delay')

const EventEmitter = require('events')
const MembershipGossipFrequencyHeuristic = require('../../src/collaboration/membership-gossip-frequency-heuristic')

class AppMock {
  constructor (timeToFirstPeer, peerCount) {
    this.peerCount = peerCount
    this.transportConnectionManager = {
      awaitAppPeer () {
        return delay(timeToFirstPeer)
      }
    }
  }
  peerCountGuess () {
    return this.peerCount
  }
}

class MembershipMock extends EventEmitter {
  needsUrgentBroadcast () {
    return true
  }
}

function createTestObjects (options, timeToFirstPeer = 0, peerCount = 1) {
  const app = new AppMock(timeToFirstPeer, peerCount)
  const membership = new MembershipMock()

  const heuristic = new MembershipGossipFrequencyHeuristic(app, membership, options)
  const eventManager = {
    events: [],
    awaitNextEvent () {
      return new Promise(resolve => heuristic.once('gossip now', resolve))
    }
  }
  heuristic.on('gossip now', (...args) => {
    eventManager.events.push(args)
  })
  return { heuristic, membership, eventManager }
}

describe('membership gossip frequency heuristic', () => {
  it('heuristic fires gossip now after each snapshot interval', async () => {
    const options = {
      samplingIntervalMS: 10,
      targetGlobalMembershipGossipFrequencyMS: 200,
      urgencyFrequencyMultiplier: 2
    }
    // Should fire on start, then approx every 100ms afterwards
    // Note:
    // targetGlobalMembershipGossipFrequencyMS / urgencyFrequencyMultiplier
    // = 200 / 2
    // = 100ms
    const { heuristic, eventManager } = createTestObjects(options)

    const start = Date.now()
    heuristic.start()

    // Should fire on start
    await eventManager.awaitNextEvent()
    const firstReceived = Date.now()
    expect(firstReceived - start).to.be.lt(100)

    // Should fire approximately every 100ms
    await eventManager.awaitNextEvent()
    const secondReceived = Date.now()
    expect(secondReceived - firstReceived).to.be.lte(150)

    await eventManager.awaitNextEvent()
    const thirdReceived = Date.now()
    expect(secondReceived - firstReceived).to.be.lte(150)

    heuristic.stop()
  })

  it('heuristic fires event when a gossip message with a state change is received', async () => {
    const { heuristic, membership, eventManager } = createTestObjects()
    heuristic.start()
    // Wait for the gossip now event that is fired on start
    await eventManager.awaitNextEvent()

    const start = Date.now()
    membership.emit('message received', true)
    // Wait for the gossip now event that is fired in response to message received
    await eventManager.awaitNextEvent()
    // Should arrive before the next sample (1000ms)
    expect(Date.now() - start).to.be.lte(100)
    heuristic.stop()
  })

  it('heuristic does not fire event when a gossip message with no state change is received', async () => {
    const { heuristic, membership, eventManager } = createTestObjects()
    heuristic.start()
    // Wait for the gossip now event that is fired on start
    await eventManager.awaitNextEvent()

    // Clear event list
    eventManager.events = []
    // Should not cause a gossip now event
    membership.emit('message received', false)
    await delay(50)
    expect(eventManager.events.length).to.be.equal(0)
    heuristic.stop()
  })

  it('heuristic does not fire event when a gossip message with a state change is received but peer count too high', async () => {
    // 3 peers in system but threshold is at 2
    const peerCount = 3
    const options = {
      immediateGossipPeerCountThreshold: 2
    }
    const { heuristic, membership, eventManager } = createTestObjects(options, 0, peerCount)
    heuristic.start()
    // Wait for the gossip now event that is fired on start
    await eventManager.awaitNextEvent()

    // Clear event list
    eventManager.events = []
    // Should not cause a gossip now event
    membership.emit('message received', false)
    await delay(50)
    expect(eventManager.events.length).to.be.equal(0)
    heuristic.stop()
  })

  it('heuristic does not fire events before starting', async () => {
    const { membership, eventManager } = createTestObjects()
    membership.emit('message received', true)
    await delay(50)
    expect(eventManager.events.length).to.be.equal(0)
  })

  it('heuristic does not fire events until another peer is discovered', async () => {
    // Wait 100ms then "discover" a peer
    const timeToFirstPeer = 100
    const { heuristic, membership, eventManager } = createTestObjects({}, timeToFirstPeer)

    const start = Date.now()

    // These should not cause any events to fire yet
    membership.emit('message received', true)
    heuristic.start()

    // These will be ignored because we're still waiting for a peer
    membership.emit('message received', true)
    membership.emit('message received', true)
    membership.emit('message received', true)

    await eventManager.awaitNextEvent()
    expect(Date.now() - start).to.be.gte(100)

    // Only one gossip now event should fire
    await delay(50)
    expect(eventManager.events.length).to.be.equal(1)
    heuristic.stop()
  })

  it('heuristic does not fire events after stopping', async () => {
    const options = {
      samplingIntervalMS: 10,
      targetGlobalMembershipGossipFrequencyMS: 10
    }
    const { heuristic, membership, eventManager } = createTestObjects(options)
    heuristic.start()
    await eventManager.awaitNextEvent()
    await eventManager.awaitNextEvent()

    heuristic.stop()
    eventManager.events = []

    // No further events should be fired
    membership.emit('message received', true)
    membership.emit('message received', true)
    membership.emit('message received', true)

    await delay(50)
    expect(eventManager.events.length).to.be.equal(0)
  })
})

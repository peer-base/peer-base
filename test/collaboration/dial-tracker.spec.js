/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const DialTracker = require('../../src/collaboration/dial-tracker')
const FakePeerInfo = require('../utils/fake-peer-info')

describe('dial tracker', () => {
  const peerInfoA = new FakePeerInfo([1, 1, 1, 1])
  const peerInfoB = new FakePeerInfo([2, 2, 2, 2])

  it('silently ignores removeDial for unknown dial id', () => {
    const tracker = new DialTracker()
    tracker.removeDial('')
    expect(tracker.isDialing(peerInfoA)).to.be.false()
  })

  it('silently ignores cancel on peer that has not been dialed', () => {
    const tracker = new DialTracker()
    tracker.cancel(new FakePeerInfo([9, 9, 9, 9]))
    expect(tracker.isDialing(peerInfoA)).to.be.false()
  })

  it('before any dials should return false for dial accessors', () => {
    const tracker = new DialTracker()
    // Not dialing anyone yet
    expect(tracker.isDialing(peerInfoA)).to.be.false()
    expect(tracker.hasDial('')).to.be.false()
  })

  it('should report dial to peer', () => {
    const tracker = new DialTracker()

    // Dial Peer A
    const dialId = tracker.add(peerInfoA)
    expect(dialId).to.exist()

    // isDialing() should report dial by peer id (not by object reference)
    expect(tracker.isDialing(peerInfoA)).to.be.true()
    expect(tracker.isDialing(new FakePeerInfo([1, 1, 1, 1]))).to.be.true()

    expect(tracker.hasDial(dialId)).to.be.true()

    // Dial to Peer A completes
    tracker.removeDial(dialId)
    expect(tracker.isDialing(peerInfoA)).to.be.false()
    expect(tracker.hasDial(dialId)).to.be.false()
  })

  it('should handle multiple dials to multiple peers', () => {
    const tracker = new DialTracker()

    // Dial Peer A twice and Peer B once
    const dialIdA1 = tracker.add(peerInfoA)
    const dialIdA2 = tracker.add(peerInfoA)
    const dialIdB1 = tracker.add(peerInfoB)
    expect(tracker.isDialing(peerInfoA)).to.be.true()
    expect(tracker.isDialing(peerInfoB)).to.be.true()
    expect(tracker.hasDial(dialIdA1)).to.be.true()
    expect(tracker.hasDial(dialIdA2)).to.be.true()
    expect(tracker.hasDial(dialIdB1)).to.be.true()

    // Remove one dial to peer A
    tracker.removeDial(dialIdA1)
    expect(tracker.isDialing(peerInfoA)).to.be.true()
    expect(tracker.isDialing(peerInfoB)).to.be.true()
    expect(tracker.hasDial(dialIdA1)).to.be.false()
    expect(tracker.hasDial(dialIdA2)).to.be.true()
    expect(tracker.hasDial(dialIdB1)).to.be.true()

    // Remove other dial to peer A
    tracker.removeDial(dialIdA2)
    expect(tracker.isDialing(peerInfoA)).to.be.false()
    expect(tracker.isDialing(peerInfoB)).to.be.true()
    expect(tracker.hasDial(dialIdA1)).to.be.false()
    expect(tracker.hasDial(dialIdA2)).to.be.false()
    expect(tracker.hasDial(dialIdB1)).to.be.true()

    // Remove dial to peer B
    tracker.removeDial(dialIdB1)
    expect(tracker.isDialing(peerInfoA)).to.be.false()
    expect(tracker.isDialing(peerInfoB)).to.be.false()
    expect(tracker.hasDial(dialIdA1)).to.be.false()
    expect(tracker.hasDial(dialIdA2)).to.be.false()
    expect(tracker.hasDial(dialIdB1)).to.be.false()
  })

  it('should handle cancel of multiple dials', () => {
    const tracker = new DialTracker()

    // Dial Peer A twice and Peer B once
    const dialIdA1 = tracker.add(peerInfoA)
    const dialIdA2 = tracker.add(peerInfoA)
    const dialIdB1 = tracker.add(peerInfoB)
    expect(tracker.isDialing(peerInfoA)).to.be.true()
    expect(tracker.isDialing(peerInfoB)).to.be.true()
    expect(tracker.hasDial(dialIdA1)).to.be.true()
    expect(tracker.hasDial(dialIdA2)).to.be.true()
    expect(tracker.hasDial(dialIdB1)).to.be.true()

    // Cancel dials to peer A
    tracker.cancel(peerInfoA)
    expect(tracker.isDialing(peerInfoA)).to.be.false()
    expect(tracker.isDialing(peerInfoB)).to.be.true()
    expect(tracker.hasDial(dialIdA1)).to.be.false()
    expect(tracker.hasDial(dialIdA2)).to.be.false()
    expect(tracker.hasDial(dialIdB1)).to.be.true()

    // Cancel dials to peer B
    tracker.cancel(peerInfoB)
    expect(tracker.isDialing(peerInfoA)).to.be.false()
    expect(tracker.isDialing(peerInfoB)).to.be.false()
    expect(tracker.hasDial(dialIdA1)).to.be.false()
    expect(tracker.hasDial(dialIdA2)).to.be.false()
    expect(tracker.hasDial(dialIdB1)).to.be.false()
  })
})

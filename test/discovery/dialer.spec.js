/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Dialer = require('../../src/discovery/dialer')
const FakePeerInfo = require('../utils/fake-peer-info')
const EventEmitter = require('events')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('dialer', () => {
  it('returns correct backoff values', () => {
    const opts = {
      dialerBackoffMinMS: 1000,
      dialerBackoffMaxMS: 5 * 60 * 1000
    }
    const dialer = new Dialer(null, opts)
    expect(dialer._getBackoff(0)).to.equal(0)
    expect(dialer._getBackoff(1)).to.equal(1000)
    expect(dialer._getBackoff(2)).to.equal(2000)
    expect(dialer._getBackoff(3)).to.equal(4000)
    expect(dialer._getBackoff(4)).to.equal(8000)
    expect(dialer._getBackoff(5)).to.equal(16000)
    expect(dialer._getBackoff(6)).to.equal(32000)
    expect(dialer._getBackoff(7)).to.equal(64000)
    expect(dialer._getBackoff(8)).to.equal(128000)
    expect(dialer._getBackoff(9)).to.equal(256000)
    // max value
    expect(dialer._getBackoff(10)).to.equal(300000)
    expect(dialer._getBackoff(11)).to.equal(300000)
    expect(dialer._getBackoff(12)).to.equal(300000)
  })

  function createLibp2pDialSimulator (dialTimeout) {
    let returnError = false
    let dials = []
    const dialEmitter = new EventEmitter()
    const libp2p = {
      dial (peerInfo, cb) {
        dials.push(peerInfo)
        dialEmitter.emit('dialing')
        setTimeout(() => {
          const err = returnError ? new Error('err') : null
          cb(err)
          dialEmitter.emit('dial complete')
        }, dialTimeout)
      }
    }

    return {
      libp2p,
      dials,
      startReturningErrors () {
        returnError = true
      },
      stopReturningErrors () {
        returnError = false
      },
      async waitForDialing () {
        return new Promise(resolve => dialEmitter.once('dialing', resolve))
      },
      async waitForDialComplete () {
        return new Promise(resolve => dialEmitter.once('dial complete', resolve))
      }
    }
  }

  it('backs off when there are dial errors', async () => {
    const sim = createLibp2pDialSimulator(10)

    const opts = {
      dialerBackoffMinMS: 50,
      dialerBackoffMaxMS: 5 * 60 * 1000
    }
    const dialer = new Dialer(sim.libp2p, opts)
    const a = new FakePeerInfo('a')

    // Will dial immediately then wait 50ms before dialing again
    sim.startReturningErrors()
    const waitFirst = sim.waitForDialing()
    dialer.dial(a, (err, completed) => {
      // Should eventually callback with success after we stop throwing
      // errors from the dial (below)
      expect(err).not.to.exist()
      expect(completed).to.equal(true)
    })
    await waitFirst // should resolve immediately
    expect(sim.dials.length).to.equal(1)

    // Subsequent dial attempts to same peer should be ignored
    dialer.dial(a, (err, completed) => {
      expect(err).not.to.exist()
      expect(completed).to.equal(false)
    })
    dialer.dial(a)
    dialer.dial(a)
    expect(sim.dials.length).to.equal(1)

    await sim.waitForDialing() // should resolve after 50ms
    // Should have dialed twice now
    expect(sim.dials.length).to.equal(2)
    // Once dial is complete and an error is returned,
    // should begin waiting 100ms before dialing again
    await sim.waitForDialComplete()

    // Subsequent dial attempts to same peer should be ignored
    dialer.dial(a, (err, completed) => {
      expect(err).not.to.exist()
      expect(completed).to.equal(false)
    })
    dialer.dial(a)
    dialer.dial(a)
    expect(sim.dials.length).to.equal(2)

    // Stop returning errors
    sim.stopReturningErrors()
    await sim.waitForDialing() // should resolve after 100ms
    expect(sim.dials.length).to.equal(3)

    // Previous dial did not return an error so should no longer continue
    // to redial
    await sim.waitForDialComplete()
    await waitFor(200)
    expect(sim.dials.length).to.equal(3)

    // Subsequent dial attempts to same peer should now succeed without
    // redialing (because we're not throwing an error any more)
    const waitSucceed = sim.waitForDialing()
    dialer.dial(a, (err, completed) => {
      expect(err).not.to.exist()
      expect(completed).to.equal(true)
    })
    await waitSucceed // should resolve immediately
    await waitFor(50) // no more redials in this time period
    expect(sim.dials.length).to.equal(4)
  })

  it('dials that do not complete within dialerMaxAttempts should return from callback with completed false and an error', async () => {
    const sim = createLibp2pDialSimulator(1)
    const dialer = new Dialer(sim.libp2p, {
      dialerBackoffMinMS: 1,
      dialerMaxAttempts: 3
    })

    let cbCount = 0
    sim.startReturningErrors()
    dialer.dial(new FakePeerInfo('a'), (err, completed) => {
      cbCount++
      expect(err).to.exist()
      expect(completed).to.equal(false)
    })
    await waitFor(50)
    expect(cbCount).to.equal(1)
    expect(sim.dials.length).to.equal(3)
  })

  it('dials interrupted by stop should return from callback with completed false', async () => {
    const sim = createLibp2pDialSimulator(50)
    const dialer = new Dialer(sim.libp2p)

    let cbCount = 0
    dialer.dial(new FakePeerInfo('a'), (err, completed) => {
      cbCount++
      expect(err).not.to.exist()
      expect(completed).to.equal(false)
    })
    dialer.stop()
    await waitFor(100)
    expect(sim.dials.length).to.equal(1)
    expect(cbCount).to.equal(1)
  })

  it('dials after stop should be ignored', async () => {
    const sim = createLibp2pDialSimulator(10)
    const dialer = new Dialer(sim.libp2p)

    // Dials after stop should be ignored
    dialer.stop()
    dialer.dial(new FakePeerInfo('a'), (err, completed) => {
      expect(err).not.to.exist()
      expect(completed).to.equal(false)
    })
    await waitFor(50)
    expect(sim.dials.length).to.equal(0)
  })

  it('cancelled dials should return from callback with completed false', async () => {
    const sim = createLibp2pDialSimulator(50)
    const dialer = new Dialer(sim.libp2p)
    const a = new FakePeerInfo('a')

    let cbCount = 0
    dialer.dial(a, (err, completed) => {
      cbCount++
      expect(err).not.to.exist()
      expect(completed).to.equal(false)
    })
    await waitFor(10)
    dialer.cancelDial(a)
    await waitFor(50)
    expect(sim.dials.length).to.equal(1)
    expect(cbCount).to.equal(1)
  })

  it('cancelled retry dials should return from callback with completed false', async () => {
    const sim = createLibp2pDialSimulator(10)
    const dialer = new Dialer(sim.libp2p)
    const a = new FakePeerInfo('a')

    let cbCount = 0
    dialer.dial(a, (err, completed) => {
      cbCount++
      expect(err).not.to.exist()
      expect(completed).to.equal(false)
    })

    sim.waitForDialComplete()
    // On the next tick it should set a timer to dial again
    await waitFor(0)
    // Cancel while the timer is running
    dialer.cancelDial(a)

    await waitFor(50)
    expect(sim.dials.length).to.equal(1)
    expect(cbCount).to.equal(1)
  })
})

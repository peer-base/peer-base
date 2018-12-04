/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Dialer = require('../../src/discovery/dialer')
const FakePeerInfo = require('../utils/fake-peer-info')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('dialer', () => {
  it('returns correct backoff values', () => {
    const opts = {
      dialerBackoffMin: 1000,
      dialerBackoffMax: 5 * 60 * 1000
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

  it('backs off when dialing', async () => {
    let returnError = true
    const dials = []
    const libp2p = {
      dial (peerInfo, cb) {
        dials.push(peerInfo)
        cb(returnError ? new Error('err') : null)
      }
    }
    const opts = {
      dialerBackoffMin: 50,
      dialerBackoffMax: 5 * 60 * 1000
    }
    const dialer = new Dialer(libp2p, opts)
    const a = new FakePeerInfo('a')

    // Will dial immediately then wait 50ms before dialing again
    dialer.dial(a)
    await waitFor(0)
    expect(dials.length).to.equal(1)

    // Subsequent dial attempts to same peer should be ignored
    dialer.dial(a)

    await waitFor(50)
    // Should have dialed again and begun waiting 100ms before dialing again
    expect(dials.length).to.equal(2)

    // Subsequent dial attempts to same peer should be ignored
    dialer.dial(a)

    // Stop returning errors
    returnError = false
    await waitFor(100)
    expect(dials.length).to.equal(3)

    // Previous dial did not return an error so should no longer dial
    await waitFor(200)
    expect(dials.length).to.equal(3)

    // Subsequent dial attempts to same peer should now succeed
    dialer.dial(a)
    await waitFor(0)
    expect(dials.length).to.equal(4)

    // Dials after stop should be ignored
    dialer.stop()
    dialer.dial(a)
    await waitFor(0)
    expect(dials.length).to.equal(4)
  })
})

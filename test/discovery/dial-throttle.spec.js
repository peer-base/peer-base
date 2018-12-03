/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const DialThrottle = require('../../src/discovery/dial-throttle')

describe('dial throttle', () => {
  it('returns a valid value with default options', () => {
    const app = {
      peerCountGuess: () => 10
    }
    const throttle = new DialThrottle(app)
    expect(typeof throttle.getDialDelay()).to.equal('number')
  })

  it('returns values in expected range', () => {
    let peerCount
    const app = {
      peerCountGuess: () => peerCount
    }
    const opts = {
      maxThrottleDelayMS: 1000,
      maxThrottleRampPeers: 20
    }
    const throttle = new DialThrottle(app, opts)

    // Test for peer counts up to the ramp maximum
    for (peerCount = 0; peerCount <= opts.maxThrottleRampPeers; peerCount++) {
      // Test 10 times (the value returned is random but should always be below max)
      const fraction = peerCount / opts.maxThrottleRampPeers
      const max = opts.maxThrottleDelayMS * fraction * fraction
      // console.log('max', max)
      for (let i = 0; i < 10; i++) {
        const delay = throttle.getDialDelay()
        // console.log(delay)
        expect(delay).to.be.lte(max)
      }
      // console.log('\n')
    }

    // Test for peer counts above the ramp maximum. Note that the returned
    // value should never be above maxThrottleDelayMS
    for (peerCount = opts.maxThrottleRampPeers; peerCount <= opts.maxThrottleRampPeers * 2; peerCount++) {
      // Test 10 times (the value returned is random but should always be below max)
      // console.log('max', opts.maxThrottleDelayMS)
      for (let i = 0; i < 10; i++) {
        const delay = throttle.getDialDelay()
        // console.log(delay)
        expect(delay).to.be.lte(opts.maxThrottleDelayMS)
      }
      // console.log('\n')
    }
  })
})

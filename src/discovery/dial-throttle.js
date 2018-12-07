'use strict'

const defaultOptions = {
  maxThrottleDelayMS: 5000,
  maxThrottleRampPeers: 20
}

module.exports = class DialThrottle {
  constructor (app, options) {
    this._app = app
    this._options = Object.assign({}, defaultOptions, options)
  }

  getDialDelay () {
    // Low delay for few peers, increasing as we get closer to
    // maxThrottleRampPeers. This is to prevent a new peer getting overloaded
    // with requests if there are a lot of other peers
    const fraction = (this._app.peerCountGuess() || 0) / this._options.maxThrottleRampPeers
    const peerCountWeight = Math.min(Math.pow(fraction, 2), 1)
    return Math.floor(Math.random() * this._options.maxThrottleDelayMS * peerCountWeight)
  }
}

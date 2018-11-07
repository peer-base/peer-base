'use strict'

const EventEmitter = require('events')

const defaultOptions = {
  samplingIntervalMS: 1000,
  targetGlobalMembershipGossipFrequencyMS: 1000,
  urgencyFrequencyMultiplier: 10
}

module.exports = class MembershipGossipFrequencyHeuristic extends EventEmitter {
  constructor (app, membership, options) {
    super()

    this._app = app
    this._membership = membership
    this._options = Object.assign({}, defaultOptions, options)
    this._totalAppPeerCountGuess = 0
    this._totalCollaborationPeerCount = 0
    this._lastBroadcast = 0

    this._sample = this._sample.bind(this)
  }

  start () {
    this._samplingInterval = setInterval(this._sample, this._options.samplingIntervalMS)
  }

  stop () {
    clearInterval(this._samplingInterval)
    this._samplingInterval = null
  }

  _sample () {
    this._totalAppPeerCountGuess = this._app.peerCountGuess()
    this._totalCollaborationPeerCount = this._membership.peerCount()
    const targetInterval = this._targetInterval()
    const now = Date.now()
    const when = targetInterval + this._lastBroadcast
    if (when <= now) {
      this._lastBroadcast = now
      this.emit('gossip now')
    }
  }

  _targetInterval () {
    const urgency = this._membership.needsUrgentBroadcast()
      ? this._options.urgencyFrequencyMultiplier : 1
    const targetAverageInterval =
      (this._totalAppPeerCountGuess * this._options.targetGlobalMembershipGossipFrequencyMS) / urgency
    return Math.floor(Math.random() * targetAverageInterval * 2)
  }
}

'use strict'

const EventEmitter = require('events')
const debounce = require('lodash/debounce')

const defaultOptions = {
  // Interval in between checking if a gossip message is due
  samplingIntervalMS: 1000,
  // The approximate interval between gossip messages globally
  targetGlobalMembershipGossipFrequencyMS: 1000,
  // If a message is urgent, how much more frequently to broadcast it
  urgencyFrequencyMultiplier: 10,
  // If the number of known peers is less than or equal to this number we
  // respond immediately to an incoming message indicating that urgent
  // broadcast is required (instead of waiting till the next sample)
  immediateGossipPeerCountThreshold: 10
}

module.exports = class MembershipGossipFrequencyHeuristic extends EventEmitter {
  constructor (app, membership, options) {
    super()

    this._app = app
    this._membership = membership
    this._options = Object.assign({}, defaultOptions, options)
    this._lastBroadcast = 0

    this._sample = this._sample.bind(this)
    this._onMembershipMessageReceived = this._onMembershipMessageReceived.bind(this)
    // Debounce just enough to catch multiple consecutive events
    this._debouncedFireGossipNow = debounce((now) => this._fireGossipNow(now), 1)
  }

  start () {
    this._running = true
    this._membership.on('message received', this._onMembershipMessageReceived)
    return this._sample()
  }

  stop () {
    this._running = false
    clearTimeout(this._samplingTimeout)
    this._membership.removeListener('message received', this._onMembershipMessageReceived)
  }

  async _onMembershipMessageReceived (changed) {
    if (!this._running || !changed) return

    // If after receiving the message someone has membership wrong, and there
    // are not a lot of peers in the collaboration, respond immediately by
    // gossiping our membership state instead of waiting for the next tick
    const lowPeerCount = this._app.peerCountGuess() <= this._options.immediateGossipPeerCountThreshold
    if (this._membership.needsUrgentBroadcast() && lowPeerCount) {
      if (await this._awaitAppPeer()) {
        this._debouncedFireGossipNow()
      }
    }
  }

  // Wait for a connection to be made to a peer that is interested in the app
  // (there's no point sending a gossip message if there's no one listening)
  async _awaitAppPeer () {
    if (!this._running) return false
    if (this.awaitingAppPeer) return false

    this.awaitingAppPeer = this._app.transportConnectionManager.awaitAppPeer()
    await this.awaitingAppPeer
    this.awaitingAppPeer = undefined

    return this._running
  }

  async _sample () {
    if (!(await this._awaitAppPeer())) return

    const targetInterval = this._targetInterval()
    const now = Date.now()
    const when = targetInterval + this._lastBroadcast
    if (when <= now) {
      this._debouncedFireGossipNow(now)
    }
    this._samplingTimeout = setTimeout(this._sample, this._options.samplingIntervalMS)
  }

  _fireGossipNow (now = Date.now()) {
    this._lastBroadcast = now
    this.emit('gossip now')
  }

  _targetInterval () {
    const urgency = this._membership.needsUrgentBroadcast()
      ? this._options.urgencyFrequencyMultiplier : 1
    const totalAppPeerCountGuess = this._app.peerCountGuess()
    const targetAverageInterval =
      (totalAppPeerCountGuess * this._options.targetGlobalMembershipGossipFrequencyMS) / urgency
    return Math.floor(Math.random() * targetAverageInterval * 2)
  }
}

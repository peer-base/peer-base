'use strict'

const debug = require('debug')('peer-base:collaboration:stats')
const EventEmitter = require('events')
const ConnectionManager = require('./connection-manager')
const Observer = require('./observer')

const defaultOptions = {
  updateFrequency: 5000,
  timeoutMS: 10000,
  timeoutScanIntervalMS: 2000
}

class CollaborationStats extends EventEmitter {
  constructor (ipfs, collaboration, collabConnectionManager, membership, globalConnectionManager, options) {
    super()
    this._ipfs = ipfs
    this._membership = membership
    this._options = Object.assign({}, defaultOptions, options)
    this._started = false
    this._enabled = false

    this._onMembershipChanged = this._onMembershipChanged.bind(this)
    this._onTimeoutsInterval = this._onTimeoutsInterval.bind(this)
    this._onStatsUpdated = this._onStatsUpdated.bind(this)

    this._connectionManager = new ConnectionManager(
      ipfs, collaboration, collabConnectionManager, globalConnectionManager, this)

    this.observer = new Observer(this._options)
    this._peerStats = new Map()
  }

  on (...args) {
    debug('on', ...args)
    super.on(...args)
    this._maybeEnable()
  }

  removeListener (...args) {
    super.removeListener(...args)
    this._maybeDisable()
  }

  _maybeEnable () {
    const listenerCount = this.listenerCount('peer updated')
    debug('maybeEnable: peer updated listener count is %d', listenerCount)
    if (listenerCount) {
      this._enable()
    }
  }

  _maybeDisable () {
    if (!this.listenerCount('peer updated')) {
      this._disable()
    }
  }

  _enable () {
    if (!this._enabled) {
      debug('enabling stats...')
      this._enabled = true
      this._connectionManager.enablePulling()
      this.observer.on('stats updated', this._onStatsUpdated)
    }
  }

  _disable () {
    if (this._enabled) {
      debug('disabling stats...')
      this._enabled = false
      this._connectionManager.disablePulling()
      this.observer.removeListener('stats updated', this._onStatsUpdated)
    }
  }

  start () {
    if (!this._started) {
      debug('starting stats...')
      this._started = true
      this._membership.on('changed', this._onMembershipChanged)
      this._timeoutsInterval = setInterval(this._onTimeoutsInterval, this._options.timeoutScanIntervalMS)
      this._connectionManager.start()
      this._onMembershipChanged()
    }
  }

  stop () {
    if (this._started) {
      debug('stopping stats...')
      this._disable()
      this._started = false
      this.observer.removeListener('stats updated', this._onStatsUpdated)
      this._membership.removeListener('changed', this._onMembershipChanged)
      if (this._timeoutsInterval) {
        clearInterval(this._timeoutsInterval)
        this._timeoutsInterval = null
      }
      this._connectionManager.stop()
    }
  }

  forPeer (peerId) {
    return this._peerStats.get(peerId)
  }

  setFor (peerId, stats, fromPeerId) {
    const currentStats = this.forPeer(peerId)
    if (currentStats && (currentStats.t < stats.t)) {
      debug('%s: set for %s', this._peerId(), peerId, stats)
      stats.localTime = Date.now()
      this._peerStats.set(peerId, stats)
      this.emit('peer updated', peerId, stats, fromPeerId)
      this.emit(peerId, stats, fromPeerId)
    }
  }

  _onMembershipChanged () {
    const peers = this._membership.peers()
    debug('membership changed:', peers)

    for (let peerId of peers) {
      if (!this._peerStats.has(peerId)) {
        this._peerStats.set(peerId, { t: 0 })
        this.emit('need', peerId)
      }
    }

    for (let peerId of this._peerStats.keys()) {
      if (!peers.has(peerId)) {
        this._peerStats.delete(peerId)
      }
    }
  }

  _onTimeoutsInterval () {
    const now = Date.now()
    for (let [peerId, stats] of this._peerStats) {
      const shouldHaveArrived = (stats.localTime || 0) + this._options.timeoutMS
      if (shouldHaveArrived < now) {
        // peer timed out, we need recent stats on this one
        this.emit('need', peerId)
      }
    }
  }

  _onStatsUpdated (stats) {
    debug('%s: stats updated for self:', this._peerId(), stats)
    this.setFor(this._peerId(), stats, this._peerId())
  }

  _peerId () {
    if (!this._cachedPeerId) {
      this._cachedPeerId = this._ipfs._peerInfo.id.toB58String()
    }
    return this._cachedPeerId
  }
}

module.exports = CollaborationStats

'use strict'

const debug = require('debug')('peer-base:collaboration:stats:observer')
const EventEmitter = require('events')
const FrequencyCounter = require('frequency-counter')

if (process.browser && !process.hrtime) {
  process.hrtime = require('browser-process-hrtime')
}

class Observer extends EventEmitter {
  constructor (options) {
    super()
    this._options = options
    this._started = false
    this._stats = {
      connections: {
        inbound: new Set(),
        outbound: new Set()
      },
      traffic: {
        total: {
          inbound: new FrequencyCounter(),
          outbound: new FrequencyCounter()
        },
        perPeer: new Map()
      },
      messages: {
        total: {
          inbound: new FrequencyCounter(),
          outbound: new FrequencyCounter()
        },
        perPeer: new Map()
      }
    }

    this._poll = this._poll.bind(this)
  }

  on (...args) {
    super.on(...args)
    this._maybeStart()
  }

  removeListener (...args) {
    super.removeListener(...args)
    this._maybeStop()
  }

  start () {
    if (!this._started) {
      debug('starting...')
      this._started = true
      this._interval = setInterval(this._poll, this._options.updateFrequency)
    }
  }

  _maybeStart () {
    if (this.listenerCount('stats updated') > 0) {
      this.start()
    }
  }

  setInboundPeers (peers) {
    this._stats.connections.inbound = peers
  }

  setOutboundPeers (peers) {
    this._stats.connections.outbound = peers
  }

  inboundMessage (fromPeer, size) {
    this._stats.traffic.total.inbound.inc(size)
    const tCounters = this._ensureTrafficCountersFor(fromPeer)
    tCounters.inbound.inc(size)

    this._stats.messages.total.inbound.inc(1)
    const mCounters = this._ensureMessageCountersFor(fromPeer)
    mCounters.inbound.inc(1)
  }

  outboundMessage (toPeer, size) {
    this._stats.traffic.total.outbound.inc(size)
    const tCounters = this._ensureTrafficCountersFor(toPeer)
    tCounters.outbound.inc(size)

    this._stats.messages.total.outbound.inc(1)
    const mCounters = this._ensureMessageCountersFor(toPeer)
    mCounters.outbound.inc(1)
  }

  stop () {
    if (this._started) {
      debug('stopping...')
      this._started = false
      if (this._interval) {
        clearInterval(this._interval)
        this._interval = null
      }
    }
  }

  _maybeStop () {
    if (this.listenerCount('stats updated') === 0) {
      this.stop()
    }
  }

  _poll () {
    const trafficPerPeer = new Map()
    const messagesPerPeer = new Map()

    const stats = {
      t: Date.now(),
      connections: this._stats.connections,
      traffic: {
        total: {
          in: this._stats.traffic.total.inbound.freq(),
          out: this._stats.traffic.total.outbound.freq()
        },
        perPeer: trafficPerPeer
      },
      messages: {
        total: {
          in: this._stats.messages.total.inbound.freq(),
          out: this._stats.messages.total.outbound.freq()
        },
        perPeer: messagesPerPeer
      }
    }

    for (let [peer, freq] of this._stats.traffic.perPeer) {
      trafficPerPeer.set(peer, {
        in: freq.inbound.freq(),
        out: freq.outbound.freq()
      })
    }

    for (let [peer, freq] of this._stats.messages.perPeer) {
      messagesPerPeer.set(peer, {
        in: freq.inbound.freq(),
        out: freq.outbound.freq()
      })
    }

    this.emit('stats updated', stats)
  }

  _ensureTrafficCountersFor (peerId) {
    let counters = this._stats.traffic.perPeer.get(peerId)
    if (!counters) {
      counters = {
        inbound: new FrequencyCounter(),
        outbound: new FrequencyCounter()
      }
      this._stats.traffic.perPeer.set(peerId, counters)
    }

    return counters
  }

  _ensureMessageCountersFor (peerId) {
    let counters = this._stats.messages.perPeer.get(peerId)
    if (!counters) {
      counters = {
        inbound: new FrequencyCounter(),
        outbound: new FrequencyCounter()
      }
      this._stats.messages.perPeer.set(peerId, counters)
    }

    return counters
  }
}

module.exports = Observer

'use strict'

const debug = require('debug')('peer-star:collaboration:clocks')
const EventEmitter = require('events')
const vectorclock = require('../common/vectorclock')

module.exports = class Clocks extends EventEmitter {
  constructor (id, options) {
    super()
    this._id = id
    this._clocks = new Map()
    this._replicateOnly = options.replicateOnly
  }

  setFor (peerId, _clock, authoritative, isPinner) {
    let clock = _clock
    if (!this._replicateOnly) {
      const previousClock = this.getFor(peerId)
      clock = vectorclock.merge(previousClock, clock)
    }
    // console.log(`${this._id}: %j => %j`, previousClock, newClock)
    debug('%s: setting clock for %s: %j', this._id, peerId, clock)
    this._clocks.set(peerId, clock)
    this.emit('update', peerId, clock, authoritative, isPinner)
    return clock
  }

  getFor (peerId) {
    return this._clocks.get(peerId) || {}
  }

  takeDown (peerId) {
    debug('taking down clock for %s', peerId)
    this._clocks.delete(peerId)
  }
}

'use strict'

const debug = require('debug')('peer-base:collaboration:clocks')
const EventEmitter = require('events')
const vectorclock = require('../common/vectorclock')

module.exports = class Clocks extends EventEmitter {
  constructor (id, options) {
    super()
    this._id = id
    this._clocks = new Map()
    this._replicateOnly = options && options.replicateOnly
  }

  setFor (peerId, clock) {
    // console.log(`${this._id}: %j => %j`, previousClock, newClock)
    debug('%s: setting clock for %s: %j', this._id, peerId, clock)
    this._clocks.set(peerId, clock)
    this.emit('update', peerId, clock)
    return clock
  }

  mergeFor (peerId, clock) {
    // If we're setting a different peer's clock, or if the local peer is not a
    // pinner, we can merge the clock rather than setting it explicitly
    if (this._id !== peerId || !this._replicateOnly) {
      const previousClock = this.getFor(peerId)
      clock = vectorclock.merge(previousClock, clock)
    }
    return this.setFor(peerId, clock)
  }

  getFor (peerId) {
    return this._clocks.get(peerId) || {}
  }

  takeDown (peerId) {
    debug('taking down clock for %s', peerId)
    this._clocks.delete(peerId)
  }
}

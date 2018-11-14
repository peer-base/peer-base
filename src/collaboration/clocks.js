'use strict'

const debug = require('debug')('peer-star:collaboration:clocks')
const EventEmitter = require('events')
const vectorclock = require('../common/vectorclock')

module.exports = class Clocks extends EventEmitter {
  constructor (id) {
    super()
    this._id = id
    this._clocks = new Map()
  }

  setFor (peerId, clock, authoritative, isPinner) {
    const previousClock = this.getFor(peerId)
    const newClock = vectorclock.merge(previousClock, clock)
    debug('%s: setting clock for %s: %j', this._id, peerId, newClock)
    this._clocks.set(peerId, newClock)
    this.emit('update', peerId, newClock, authoritative, isPinner)
  }

  getFor (peerId) {
    return this._clocks.get(peerId) || {}
  }

  takeDown (peerId) {
    debug('taking down clock for %s', peerId)
    this._clocks.delete(peerId)
  }
}

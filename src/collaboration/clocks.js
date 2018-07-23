'use strict'

const debug = require('debug')('peer-star:collaboration:clocks')
const vectorclock = require('../common/vectorclock')

module.exports = class Clocks {
  constructor (id) {
    this._id = id
    this._clocks = new Map()
  }

  setFor (peerId, clock) {
    const previousClock = this.getFor(peerId)
    const newClock = vectorclock.merge(previousClock, clock)
    debug('%s: setting clock for %s: %j', this._id, peerId, newClock)
    this._clocks.set(peerId, newClock)
  }

  getFor (peerId) {
    return this._clocks.get(peerId) || {}
  }

  takeDown (peerId) {
    debug('taking down clock for %s', peerId)
    this._clocks.delete(peerId)
  }
}

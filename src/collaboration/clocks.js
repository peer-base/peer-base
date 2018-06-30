'use strict'

const debug = require('debug')('peer-star:collaboration:clocks')
const vectorclock = require('../common/vectorclock')

module.exports = class Clocks {
  constructor () {
    this._clocks = new Map()
  }

  setFor (peerId, clock) {
    debug('setting clock for %s: %j', peerId, clock)
    const previousClock = this.getFor(peerId)
    const newClock = vectorclock.merge(previousClock, clock)
    this._clocks.set(peerId, newClock)
  }

  getFor (peerId) {
    return this._clocks.get(peerId) || {}
  }

  takeDown (peerId) {
    debug('taking down clock for %s', peerId)
    this.clocks.delete(peerId)
  }
}

'use strict'

const EventEmitter = require('events')
const vectorclock = require('../common/vectorclock')

module.exports = (...args) => {
  return new Replication(...args)
}

class Replication extends EventEmitter {
  constructor (selfId, clocks) {
    super()
    this._selfId = selfId
    this._clocks = clocks
    this._selfClock = {}
    this._sentClocks = new Map()
  }

  received (peerId, clock) {
    if (peerId === this._selfId) {
      return
    }
    if (vectorclock.isIdentical(this._selfClock, clock)) {
      return
    }
    const comparison = vectorclock.compare(this._selfClock, clock)
    if (comparison < 0 || comparison === 0) {
      this.emit('received', peerId, clock)
    }
    this._selfClock = vectorclock.merge(this._selfClock, clock)
  }

  sent (peerId, clock, isPinner) {
    if (peerId === this._selfId) {
      return
    }

    const latestClock = this._sentClocks.get(peerId) || {}
    if (vectorclock.isIdentical(latestClock, clock)) {
      return
    }

    const selfClock = this._clocks.getFor(this._selfId)

    if (vectorclock.isIdentical(selfClock, clock) || (vectorclock.compare(selfClock, clock) < 0)) {
      if (isPinner) {
        this.emit('pinned', peerId, clock)
      } else {
        this.emit('replicated', peerId, clock)
      }
    }
    this._sentClocks.set(peerId, clock)
  }
}

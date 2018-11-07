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

    this._clocks.on('update', this._onPeerClockUpdate.bind(this))
  }

  _onPeerClockUpdate (peerId, remoteClock) {
    const localClock = this._clocks.getFor(this._selfId)
    const comparison = vectorclock.compare(remoteClock, localClock)
    const replicated = (comparison > 0) || (comparison === 0 && vectorclock.isIdentical(remoteClock, localClock))
    if (replicated) {
      this.emit('replicated', peerId)
    }
  }
}

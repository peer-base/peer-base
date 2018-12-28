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
    this._clocksByPeer = new Map()
    this._pinners = new Set()
  }

  addPinner (peerId) {
    if (!this._pinners.has(peerId)) {
      this._pinners.add(peerId)
      this.emit('pinner joined', peerId)
    }
  }

  removePinner (peerId) {
    if (this._pinners.has(peerId)) {
      this._pinners.delete(peerId)
      this.emit('pinner left', peerId)
    }
  }

  pinnerPeers () {
    return new Set(this._pinners)
  }

  isCurrentStatePersistedOnPinner () {
    if (!this._pinners.size) {
      return false
    }

    const myClock = this._clocks.getFor(this._selfId)
    return ([...this._pinners].filter((pinnerPeerId) => {
      const pinnerClock = this._ensurePeerClocks(pinnerPeerId).sent
      return vectorclock.doesSecondHaveFirst(myClock, pinnerClock)
    })).length
  }

  receiving (peerId, clock) {
    if (peerId === this._selfId) {
      return
    }
    const myClock = this._clocks.getFor(this._selfId)
    if (vectorclock.doesSecondHaveFirst(clock, myClock)) {
      return
    }
    const peerClocks = this._ensurePeerClocks(peerId)
    if (vectorclock.doesSecondHaveFirst(clock, peerClocks.receiving)) {
      return
    }

    peerClocks.receiving = vectorclock.merge(peerClocks.receiving, clock)
    this.emit('receiving', peerId, peerClocks.receiving)
  }

  received (peerId, clock) {
    if (peerId === this._selfId) {
      return
    }

    const peerClocks = this._ensurePeerClocks(peerId)
    if (vectorclock.doesSecondHaveFirst(clock, peerClocks.received)) {
      return
    }

    peerClocks.received = vectorclock.merge(peerClocks.received, clock)
    this.emit('received', peerId, peerClocks.received)
  }

  sending (peerId, clock, isPinner) {
    if (peerId === this._selfId) {
      return
    }
    const myClock = this._clocks.getFor(this._selfId)
    if (!vectorclock.isIdentical(clock, myClock)) {
      return
    }
    const peerClocks = this._ensurePeerClocks(peerId)
    if (vectorclock.doesSecondHaveFirst(clock, peerClocks.sending)) {
      return
    }

    peerClocks.sending = vectorclock.merge(peerClocks.sending, clock)

    let eventName = isPinner ? 'pinning' : 'replicating'
    this.emit(eventName, peerId, peerClocks.sending)
  }

  sent (peerId, clock, isPinner) {
    if (peerId === this._selfId) {
      return
    }
    const myClock = this._clocks.getFor(this._selfId)
    if (!vectorclock.isIdentical(clock, myClock)) {
      return
    }
    const peerClocks = this._ensurePeerClocks(peerId)
    if (vectorclock.doesSecondHaveFirst(clock, peerClocks.sent)) {
      return
    }

    peerClocks.sent = vectorclock.merge(peerClocks.sent, clock)

    let eventName = isPinner ? 'pinned' : 'replicated'
    this.emit(eventName, peerId, peerClocks.sent)
  }

  _ensurePeerClocks (peer) {
    let peerClocks = this._clocksByPeer.get(peer)
    if (!peerClocks) {
      peerClocks = {
        sending: {},
        sent: {},
        receiving: {},
        received: {}
      }
      this._clocksByPeer.set(peer, peerClocks)
    }
    return peerClocks
  }
}

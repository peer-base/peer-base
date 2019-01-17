'use strict'

const hat = require('hat')

// Keeps track of dials made by the ConnectionManager
module.exports = class DialTracker {
  constructor () {
    this._dialing = new Map()
  }

  // Indicates if there are there any dials in progress to the given peer
  isDialing (peerInfo) {
    return this._dialing.has(peerInfo.id.toB58String())
  }

  // Add a dial to the given peer
  // Returns a dial ID
  add (peerInfo) {
    const peerId = peerInfo.id.toB58String()
    const id = hat()
    const ids = this._dialing.get(peerId) || []
    ids.push(id)
    this._dialing.set(peerId, ids)
    // dial id is of the form "<peer id>#<id>"
    return peerId + '#' + id
  }

  // Cancel all dials to the given peer
  cancel (peerInfo) {
    this._dialing.delete(peerInfo.id.toB58String())
  }

  // Indicates if the given dial is in progress
  hasDial (dialId) {
    // dial id is of the form "<peer id>#<id>"
    const [peerId, id] = (dialId || '').split('#')
    const ids = this._dialing.get(peerId)
    return (ids || []).includes(id)
  }

  // Removes the given dial from the tracker
  removeDial (dialId) {
    // dial id is of the form "<peer id>#<id>"
    const [peerId, id] = (dialId || '').split('#')
    const ids = this._dialing.get(peerId)
    if (!ids) {
      return
    }

    ids.splice(ids.findIndex(i => i === id), 1)
    if (ids.length) {
      this._dialing.set(peerId, ids)
    } else {
      this._dialing.delete(peerId)
    }
  }
}

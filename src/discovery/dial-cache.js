'use strict'

const defaultOptions = {
  // Maximum time to wait before considering a 'peer' event
  // to be "new" after receiving a previous 'peer' event
  dialCacheExpiryMS: 5 * 60 * 1000,
  // Maximum number of peers to store in cache
  dialCacheCapacity: 256
}

// Keep a cache of recently dialed peers so we don't redial them too frequently
module.exports = class DialCache {
  constructor (options) {
    this._options = Object.assign({}, defaultOptions, options)
    this._peersDiscovered = new Map()
  }

  add (peerInfo) {
    const now = Date.now()
    const idB58 = peerInfo.id.toB58String()
    const discoveredAt = this._peersDiscovered.get(idB58)
    const set = this._isFresh(discoveredAt, now)
    if (set) {
      this._peersDiscovered.set(idB58, now)
      this._evictOldest()
    }
    return Boolean(set)
  }

  remove (peerInfo) {
    const idB58 = peerInfo.id.toB58String()
    this._peersDiscovered.delete(idB58)
  }

  get size () {
    return this._peersDiscovered.size
  }

  _isFresh (at, now) {
    return !at || at < now - this._options.dialCacheExpiryMS
  }

  _evictOldest () {
    if (this._peersDiscovered.size <= this._options.dialCacheCapacity) return

    let oldestFirst = [...this._peersDiscovered].sort((a, b) => a[1] - b[1])
    this._peersDiscovered.delete(oldestFirst[0][0])
  }
}

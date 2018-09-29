'use strict'

const EventEmitter = require('events')

exports = module.exports = (...args) => new Ring(...args)

class Ring extends EventEmitter {
  constructor (preambleByteCount) {
    super()

    this._preambleByteCount = preambleByteCount
    this._points = []
    this._contacts = new Map()
  }

  get size () {
    return this._points.length
  }

  add (peerInfo) {
    const point = this._peerIdFromPeerInfo(peerInfo)
    if (!this.has(point)) {
      this._points.push(point)
      this._points.sort(compare)
      this._contacts.set(point.toString('hex'), peerInfo)
      this.emit('changed', peerInfo)
    }
  }

  remove (peerInfo) {
    const point = this._peerIdFromPeerInfo(peerInfo)
    for (let i in this._points) {
      const p = this._points[i]
      const comparison = compare(point, p)
      if (comparison === 0) {
        // found point
        const points = this._points
        const index = parseInt(i, 10)
        this._points = points.slice(0, index).concat(points.slice(index + 1))
        this._contacts.delete(p.toString('hex'))
        this.emit('removed', peerInfo)
        this.emit('changed')
        return true
      } else if (comparison < 0) {
        // point not here
        break
      }
    }
    return false
  }

  has (peerInfo) {
    const point = this._peerIdFromPeerInfo(peerInfo)
    for (let p of this._points) {
      if (compare(point, p) === 0) {
        // found point
        return true
      }
    }
    return false
  }

  successorOf (peerInfo) {
    const point = this._peerIdFromPeerInfo(peerInfo)

    for (let p of this._points) {
      const comparison = compare(point, p)
      if (comparison < 0) {
        // we're after the given point
        return this._peerInfoFromPoint(p)
      }
    }
    return this._peerInfoFromPoint(this._points[0])
  }

  at (peerInfo) {
    const point = this._peerIdFromPeerInfo(peerInfo)

    let last
    for (let p of this._points) {
      const comparison = compare(point, p)
      if (comparison >= 0) {
        // we're at or before the given point
        last = p
      } else {
        // we're after the given point
        return this._peerInfoFromPoint(last)
      }
    }
    return this._peerInfoFromPoint(this._points[this._points.length - 1])
  }

  _peerInfoFromPoint (point) {
    return point && this._contacts.get(point.toString('hex'))
  }

  _peerIdFromPeerInfo (peerInfo) {
    if (Buffer.isBuffer(peerInfo) || Array.isArray(peerInfo)) {
      return peerInfo
    }
    // slice off the preamble so that we get a better distribution
    return peerInfo.id.toBytes().slice(this._preambleByteCount)
  }
}

function compare (a, b) {
  const bytes = Math.max(a.length, b.length)
  for (let i = 0; i < bytes; i++) {
    // || 0 is for when byte length is not the same
    const l = a[i] || 0
    const r = b[i] || 0
    if (l !== r) {
      return l - r
    }
  }
  return 0
}

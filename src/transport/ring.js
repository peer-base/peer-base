'use strict'

module.exports = (...args) => new Ring(...args)

class Ring {
  constructor (bytes) {
    this._bytes = bytes
    this._points = []
  }

  add (point) {
    if (!this.has(point)) {
      this._points.push(point)
      this._points.sort(compare)
    }
  }

  remove (point) {
    for (let i in this._points) {
      const p = this._points[i]
      const comparison = compare(point, p)
      if (comparison === 0) {
        // found point
        const points = this._points
        this._points = points.slice(0, i).concat(points.slice(i + 1))
        break
      } else if (comparison < 0) {
        // point not here
        break
      }
    }
  }

  has (point) {
    for (let p of this._points) {
      if (compare(point, p) === 0) {
        // found point
        return true
      }
    }
    return false
  }

  successorOf (point) {
    for (let p of this._points) {
      const comparison = compare(point, p)
      if (comparison < 0) {
        // we're after the given point
        return p
      }
    }
    return this._points[0]
  }

  at (point) {
    let last
    for (let p of this._points) {
      const comparison = compare(point, p)
      if (comparison >= 0) {
        // we're at or before the given point
        last = p
      } else {
        // we're after the given point
        return last
      }
    }
    return this._points[this._points.length - 1]
  }
}

function compare (a, b) {
  const bytes = Math.max(a.length, b.length)
  for (let i = 0; i < bytes; i++) {
    // || 0 is for when byte length is not the same
    const l = a[i] || 0
    const r = b[i] || 0
    if (l === r) {
      // damn it.. proceeding to the next byte
      continue
    }
    return l - r
  }
  return 0
}

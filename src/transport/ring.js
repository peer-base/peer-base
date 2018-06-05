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
        const points = this._points
        this._points = points.slice(0, i).concat(points.slice(i + 1))
        break
      } else if (comparison < 0) {
        break
      }
    }
  }

  has (point) {
    for (let p of this._points) {
      if (compare(point, p) === 0) {
        return true
      }
    }
    return false
  }

  successorOf (point) {
    for (let p of this._points) {
      const comparison = compare(point, p)
      console.log('compare(%j, %j) = ', point, p, comparison)
      if (comparison < 0) {
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
        last = p
      } else {
        return last
      }
    }
    return this._points[this._points.length - 1]
  }
}

function compare (a, b) {
  const bytes = Math.max(a.length, b.length)
  for (let i = 0 ; i < bytes; i ++) {
    const l = a[i] || 0
    const r = b[i] || 0
    if (l === r) {
      continue
    }
    return l - r
  }
  return 0
}

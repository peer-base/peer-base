'use strict'

const debug = require('debug')('peer-star:discovery:dialer')

const defaultOptions = {
  dialerBackoffMin: 1000,
  dialerBackoffMax: 5 * 60 * 1000
}

module.exports = class Dialer {
  constructor (libp2p, options) {
    this._libp2p = libp2p
    this._options = Object.assign({}, defaultOptions, options)
    this._dialing = new Set()
  }

  dial (peerInfo, attempt = 0) {
    const id = peerInfo.id.toB58String()

    // Check if we've stopped
    if (!this._dialing) {
      debug('ignoring dial attempt to %s - dialer has stopped', id)
      return
    }

    // Check if we're already dialing this peer
    if (attempt === 0) {
      if (this._dialing.has(id)) {
        debug('ignoring dial attempt to %s - already retrying', id)
        return
      }
      this._dialing.add(id)
    }

    this._libp2p.dial(peerInfo, err => {
      // If there was a dial error, retry with exponential backoff
      if (err) {
        attempt++
        const backoff = this._getBackoff(attempt)
        debug('error dialing peer %s: %s. Backing off %dms', id, err.message, backoff)
        setTimeout(() => this.dial(peerInfo, attempt), backoff)
      } else {
        this._dialing.delete(id)
      }
    })
  }

  _getBackoff (attempt) {
    if (attempt === 0) {
      return 0
    }
    const backoff = Math.pow(2, attempt - 1) * this._options.dialerBackoffMin
    return Math.min(backoff, this._options.dialerBackoffMax)
  }

  stop () {
    debug('stop')
    this._dialing = null
  }
}

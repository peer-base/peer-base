'use strict'

const debug = require('debug')('peer-star:discovery:dialer')

const defaultOptions = {
  dialerBackoffMinMS: 1000,
  dialerBackoffMaxMS: 60 * 1000,
  dialerMaxAttempts: 3
}

module.exports = class Dialer {
  constructor (libp2p, options) {
    this._libp2p = libp2p
    this._options = Object.assign({}, defaultOptions, options)
    this._dialing = new Set()
    this._timeouts = new Map()
  }

  dial (peerInfo, cb, attempt = 0) {
    const id = peerInfo.id.toB58String()

    // Check if dialer was stopped
    if (!this._dialing) {
      debug('ignoring dial attempt to %s - dialer has stopped', id)
      return cb && cb(null, false)
    }

    // Check if dialer is already dialing this peer
    if (attempt === 0) {
      if (this._dialing.has(id)) {
        debug('ignoring dial attempt to %s - already retrying', id)
        return cb && cb(null, false)
      }
      this._dialing.add(id)
    }

    debug('dialing peer %s', id)
    this._libp2p.dial(peerInfo, err => {
      // Check if dialer was stopped
      if (!this._dialing) {
        debug('dial to peer %s completed but dialer has stopped', id)
        return cb && cb(null, false)
      }

      // Check if dial was cancelled
      if (!this._dialing.has(id)) {
        debug('dial to peer %s completed but dial was cancelled', id)
        return cb && cb(null, false)
      }

      // If there was a dial error, retry with exponential backoff
      if (err) {
        attempt++
        if (attempt >= this._options.dialerMaxAttempts) {
          debug('already dialled to peer %s %d times - giving up', id, this._options.dialerMaxAttempts)
          this._dialing.delete(id)
          return cb(err, false)
        }

        const backoff = this._getBackoff(attempt)
        debug('error dialing peer %s: %s. Backing off %dms', id, err.message, backoff)
        const timeout = setTimeout(() => {
          this._timeouts.delete(id)
          this.dial(peerInfo, cb, attempt)
        }, backoff)
        this._timeouts.set(id, { timeout, cb })
      } else {
        debug('dial to peer %s succeeded', id)
        this._dialing.delete(id)
        cb && cb(null, true)
      }
    })
  }

  _getBackoff (attempt) {
    if (attempt === 0) {
      return 0
    }
    const backoff = Math.pow(2, attempt - 1) * this._options.dialerBackoffMinMS
    return Math.min(backoff, this._options.dialerBackoffMaxMS)
  }

  dialing (peerInfo) {
    const id = peerInfo.id.toB58String()
    return Boolean(this._dialing && this._dialing.has(id))
  }

  cancelDial (peerInfo) {
    const id = peerInfo.id.toB58String()
    this._cancelDial(id)
  }

  _cancelDial (id) {
    debug('canceling dial to %s', id)
    // Cancel the dial
    this._dialing && this._dialing.delete(id)

    // If there is a timer for a dial retry, cancel that too
    if (!this._timeouts.get(id)) return

    debug('canceling dial to %s now', id)
    const { timeout, cb } = this._timeouts.get(id)
    clearTimeout(timeout)
    cb && cb(null, false)
  }

  stop () {
    debug('stop')
    this._dialing = null
    for (const id of this._timeouts.keys()) {
      this._cancelDial(id)
    }
  }
}

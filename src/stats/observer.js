'use strict'

const debug = require('debug')('peer-star:collaboration:stats:observer')
const EventEmitter = require('events')

class Observer extends EventEmitter {
  constructor (options) {
    super()
    this._options = options
    this._started = false

    this._poll = this._poll.bind(this)
  }

  on (...args) {
    super.on(...args)
    this._maybeStart()
  }

  removeListener (...args) {
    super.removeListener(...args)
    this._maybeStop()
  }

  start () {
    if (!this._started) {
      debug('starting...')
      this._started = true
      this._interval = setInterval(this._poll, this._options.updateFrequency)
    }
  }

  _maybeStart () {
    if (this.listenerCount('stats updated') > 0) {
      this.start()
    }
  }

  stop () {
    if (this._started) {
      debug('stopping...')
      this._started = false
      if (this._interval) {
        clearInterval(this._interval)
        this._interval = null
      }
    }
  }

  _maybeStop () {
    if (this.listenerCount('stats updated') === 0) {
      this.stop()
    }
  }

  _poll () {
    const newStats = {
      t: Date.now()
    }
    this.emit('stats updated', newStats)
  }
}

module.exports = Observer

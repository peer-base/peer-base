'use strict'

const EventEmitter = require('events')

class Observer extends EventEmitter {
  constructor (options) {
    super()
    this._options = options

    this._poll = this._poll.bind(this)
  }

  start () {
    this._interval = setInterval(this._poll, this._options.updateFrequency)
  }

  stop () {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
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

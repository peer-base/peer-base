'use strict'

const EventEmitter = require('events')

module.exports = class Gossip extends EventEmitter {
  constructor (app) {
    super()
    this._app = app

    this._app.on('gossip', (message) => this.emit('message', message))
  }

  broadcast (message) {
    return this._app.gossip(message)
  }
}

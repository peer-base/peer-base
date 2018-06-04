'use strict'

const EventEmitter = require('events')

module.exports = (app, collaborationName, options) =>
  new Collaboration(app, collaborationName, options)

class Collaboration extends EventEmitter {
  constructor (app, name, options) {
    super()
    this._app = app
    this.name = name
  }

  start () {
    // TODO
  }

  stop () {
    // TODO
  }
}

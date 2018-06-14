'use strict'

const EventEmitter = require('events')
const Membership = require('./membership')

module.exports = (app, collaborationName, options) =>
  new Collaboration(app, collaborationName, options)

class Collaboration extends EventEmitter {
  constructor (app, name, options) {
    super()
    this._app = app
    this.name = name

    this._membership = new Membership(app)
  }

  start () {
    this._membership.start()
  }

  stop () {
    this._membership.stop()
  }
}

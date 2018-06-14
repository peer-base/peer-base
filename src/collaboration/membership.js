'use strict'

const EventEmitter = require('events')
const Gossip = require('./gossip')

module.exports = class Membership extends EventEmitter {
  constructor (app) {
    super()

    this._onGossipMessage = this._onGossipMessage.bind(this)

    this._gossip = new Gossip(app)
  }

  start () {
    this._gossip.on('message', this._onGossipMessage)
  }

  stop () {
    this._gossip.removeListener('message', this._onGossipMessage)
  }

  _onGossipMessage (message) {

  }
}

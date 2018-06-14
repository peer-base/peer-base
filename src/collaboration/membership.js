'use strict'

const EventEmitter = require('events')
const Gossip = require('./gossip')

module.exports = class Membership extends EventEmitter {
  constructor (app, collaborationName) {
    super()

    this._app = app
    this._collaborationName = collaborationName

    this._members = new Set()
    this._onGossipMessage = this._onGossipMessage.bind(this)

    this._gossip = new Gossip(app)
    // this._frequencyHeuristic = new FrequencyHeuristic(app, this._collaborationName)
  }

  start () {
    this._gossip.on('message', this._onGossipMessage)
  }

  stop () {
    this._gossip.removeListener('message', this._onGossipMessage)
  }

  _onGossipMessage (message) {

  }
}

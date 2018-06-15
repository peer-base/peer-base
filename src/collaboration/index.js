'use strict'

const EventEmitter = require('events')
const Membership = require('./membership')

module.exports = (app, collaborationName, options) =>
  new Collaboration(app, collaborationName, options)

class Collaboration extends EventEmitter {
  constructor (ipfs, app, name, options) {
    super()
    this._ipfs = ipfs
    this._app = app
    this.name = name

    this._membership = new Membership(ipfs, app, name)
    this._membership.on('changed', () => {
      this.emit('membership changed', this._membership.peers())
    })
  }

  start () {
    return this._membership.start()
  }

  stop () {
    this.emit('stopped')
    return this._membership.stop()
  }

  peers () {
    return this._membership.peers()
  }

  deliverRemoteMembership (membership) {
    this._membership.deliverRemoteMembership(membership)
  }
}

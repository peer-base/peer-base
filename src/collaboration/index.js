'use strict'

const EventEmitter = require('events')
const Membership = require('./membership')

const defaultOptions = {
  preambleByteCount: 2,
  peerIdByteCount: 32,
  debounceResetConnectionsMS: 1000
}

module.exports = (app, collaborationName, options) =>
  new Collaboration(app, collaborationName, options)

class Collaboration extends EventEmitter {
  constructor (ipfs, app, name, options) {
    super()
    this._ipfs = ipfs
    this._app = app
    this.name = name
    this._options = Object.assign({}, defaultOptions, options)

    this._membership = new Membership(ipfs, app, this, this._options)
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
    return this._membership.deliverRemoteMembership(membership)
  }

  presentation () {
    return Promise.resolve('hello!') // TODO: do a proper presentation from a collab store
  }
}

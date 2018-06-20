'use strict'

const EventEmitter = require('events')
const Membership = require('./membership')
const Store = require('./store')

const defaultOptions = {
  preambleByteCount: 2,
  peerIdByteCount: 32,
  debounceResetConnectionsMS: 1000
}

module.exports = (...args) => new Collaboration(...args)

class Collaboration extends EventEmitter {
  constructor (ipfs, globalConnectionManager, app, name, options) {
    super()
    this._app = app
    this.name = name
    this._options = Object.assign({}, defaultOptions, options)

    this._store = new Store(ipfs, this)
    this._store.on('state changed', ([clock, state]) => {
      this.emit('state changed', state)
    })

    this._membership = new Membership(ipfs, globalConnectionManager, app, this, this._store, this._options)
    this._membership.on('changed', () => {
      this.emit('membership changed', this._membership.peers())
    })
  }

  start () {
    return Promise.all([this._membership.start(), this._store.start()])
  }

  stop () {
    this.emit('stopped')
    return Promise.all([this._membership.stop(), this._store.stop()])
  }

  peers () {
    return this._membership.peers()
  }

  deliverRemoteMembership (membership) {
    return this._membership.deliverRemoteMembership(membership)
  }

  saveState (state) {
    return this._store.saveState([undefined, state])
  }

  getState () {
    return this._store.getState()
  }
}

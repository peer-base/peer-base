'use strict'

const EventEmitter = require('events')
const Membership = require('./membership')
const Store = require('./store')
const Shared = require('./shared')
const CRDT = require('./crdt')

const defaultOptions = {
  preambleByteCount: 2,
  peerIdByteCount: 32,
  debounceResetConnectionsMS: 1000
}

module.exports = (...args) => new Collaboration(...args)

class Collaboration extends EventEmitter {
  constructor (ipfs, globalConnectionManager, app, name, type, options) {
    super()
    this._ipfs = ipfs
    this._app = app
    this.name = name
    this._options = Object.assign({}, defaultOptions, options)

    this._store = new Store(ipfs, this)
    this._store.on('state changed', (state) => {
      this.emit('state changed', state)
    })

    this._membership = new Membership(ipfs, globalConnectionManager, app, this, this._store, this._options)
    this._membership.on('changed', () => {
      this.emit('membership changed', this._membership.peers())
    })

    if (!type) {
      throw new Error('need collaboration type')
    }
    this._type = CRDT(type)
    if (!this._type) {
      console.log('invalid collaboration type:', type)
    }
  }

  async start () {
    await this._membership.start()
    await this._store.start()
    const id = (await this._ipfs.id()).id
    this.shared = await Shared(id, this._type, this._store)
  }

  async stop () {
    this.shared.stop()
    await Promise.all([this._membership.stop(), this._store.stop()])
    this.emit('stopped')
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

  async _startShared () {

  }
}

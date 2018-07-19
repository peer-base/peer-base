'use strict'

const EventEmitter = require('events')
const Membership = require('./membership')
const Store = require('./store')
const Shared = require('./shared')
const CRDT = require('./crdt')
const deriveCreateCipherFromKeys = require('../keys/derive-cipher-from-keys')

const defaultOptions = {
  preambleByteCount: 2,
  peerIdByteCount: 32,
  debounceResetConnectionsMS: 1000,
  maxDeltaRetention: 1000,
  deltaTrimTimeoutMS: 1000
}

module.exports = (...args) => new Collaboration(...args)

class Collaboration extends EventEmitter {
  constructor (isRoot, ipfs, globalConnectionManager, app, name, type, options) {
    super()
    this._isRoot = isRoot
    this._ipfs = ipfs
    this._globalConnectionManager = globalConnectionManager
    this._app = app
    this.name = name
    this._options = Object.assign({}, defaultOptions, options)

    if (!this._options.keys) {
      throw new Error('need options.keys')
    }

    if (!this._options.createCipher) {
      this._options.createCipher = deriveCreateCipherFromKeys(this._options.keys)
    }

    this._store = this._options.store || new Store(ipfs, this, this._options)
    this._store.on('state changed', (state) => {
      this.emit('state changed', state)
    })

    this._membership = this._options.membership || new Membership(ipfs, globalConnectionManager, app, this, this._store, this._options)
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

    this._subs = new Map()
  }

  async start () {
    if (this._starting) {
      return this._starting
    }

    this._starting = this._start()
    await this._starting
    await Promise.all(Array.from(this._subs.values()).map((sub) => sub.start()))
  }

  async sub (name, type) {
    let collab = this._subs.get(name)
    if (!collab) {
      const options = Object.assign({}, this._options, {
        store: this._store,
        membership: this._membership
      })

      collab = new Collaboration(
        false,
        this._ipfs,
        this._globalConnectionManager,
        this._app,
        name,
        type,
        options
      )

      this._subs.set(name, collab)
    }

    if (this._starting) {
      await this._starting
      await collab.start()
    }

    return collab
  }

  async _start () {
    if (this._isRoot) {
      await this._membership.start()
      await this._store.start()
    }
    const id = (await this._ipfs.id()).id
    const name = this._storeName()
    this.shared = await Shared(name, id, this._type, this, this._store, this._options.keys)
    this.shared.on('error', (err) => this.emit('error', err))
    this._store.setShared(this.shared, name)

    await Array.from(this._subs.values()).map((sub) => sub.start())
  }

  async stop () {
    this.shared.stop()
    if (this._isRoot) {
      await Promise.all([this._membership.stop(), this._store.stop()])
    }
    await Array.from(this._subs.values()).map((sub) => sub.stop())
    this.emit('stopped')
  }

  peers () {
    return this._membership.peers()
  }

  outboundConnectionCount () {
    return this._membership.outboundConnectionCount()
  }

  inboundConnectionCount () {
    return this._membership.inboundConnectionCount()
  }

  deliverRemoteMembership (membership) {
    return this._membership.deliverRemoteMembership(membership)
  }

  _storeName () {
    return this._isRoot ? null : this.name
  }
}

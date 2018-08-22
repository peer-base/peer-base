'use strict'

const debug = require('debug')('peer-star:collaboration')
const EventEmitter = require('events')
const Membership = require('./membership')
const Store = require('./store')
const Shared = require('./shared')
const CRDT = require('./crdt')
const Gossip = require('./gossip')
const Clocks = require('./clocks')
const deriveCreateCipherFromKeys = require('../keys/derive-cipher-from-keys')
const Stats = require('../stats')

const defaultOptions = {
  preambleByteCount: 2,
  peerIdByteCount: 32,
  debounceResetConnectionsMS: 1000,
  maxDeltaRetention: 1000,
  deltaTrimTimeoutMS: 1000,
  resetConnectionIntervalMS: 6000,
  maxUnreachableBeforeEviction: 10
}

module.exports = (...args) => new Collaboration(...args)

class Collaboration extends EventEmitter {
  constructor (isRoot, ipfs, globalConnectionManager, app, name, type, options, parentCollab) {
    super()
    this._isRoot = isRoot
    this._ipfs = ipfs
    this._globalConnectionManager = globalConnectionManager
    this.app = app
    this.name = name
    this._options = Object.assign({}, defaultOptions, options)
    this._parentCollab = parentCollab
    this._gossips = new Set()
    this._clocks = new Clocks(this._ipfs._peerInfo.id.toB58String())

    if (!this._options.keys) {
      console.warn('No options.keys')
      this._options.keys = {}
    }

    if (!this._options.createCipher && this._options.keys.read) {
      this._options.createCipher = deriveCreateCipherFromKeys(this._options.keys)
    }

    this._store = this._options.store || new Store(ipfs, this, this._options)

    this._membership = this._options.membership || new Membership(ipfs, globalConnectionManager, app, this, this._store, this._clocks, this._options)
    this._membership.on('changed', () => {
      debug('membership changed')
      this.emit('membership changed', this._membership.peers())
    })

    if (!type) {
      throw new Error('need collaboration type')
    }
    this.typeName = type
    this._type = CRDT(type)
    if (!this._type) {
      throw new Error('invalid collaboration type:' + type)
    }

    this._subs = new Map()

    this.stats = new Stats(
      ipfs,
      this,
      this._membership.connectionManager,
      this._membership,
      globalConnectionManager,
      this._options.stats)
  }

  async start () {
    if (this._starting) {
      return this._starting
    }

    this._starting = this._start()
    await this._starting
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
        this.app,
        name,
        type,
        options,
        this
      )

      this._subs.set(name, collab)
    }

    if (this._starting) {
      await this._starting
      await collab.start()
    }

    return collab
  }

  gossipName (_name) {
    let name = _name
    if (this._isRoot) {
      name = [this.app.name, this.name, name].join('/')
    } else {
      name = [this._parentCollab.gossipName(), this.name, name].join('/')
    }
    return name
  }

  gossip (name) {
    const gossip = Gossip(this._ipfs, this.gossipName(name), this._options.keys)
    gossip.then((gossip) => {
      this._gossips.add(gossip)
      gossip.once('stopped', () => {
        this._gossips.delete(gossip)
      })
    })
    return gossip
  }

  vectorClock (peerId) {
    return this._membership.vectorClock(peerId)
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
    this._store.on('clock changed', (clock) => {
      this._clocks.setFor(id, clock)
    })
    this.shared.on('state changed', (fromSelf) => {
      this.emit('state changed', fromSelf)
    })
    this._clocks.setFor(id, await this._store.getLatestClock())
    this._store.setShared(this.shared, name)

    this.stats.start()
    this._unregisterObserver = this._membership.connectionManager.observe(this.stats.observer)

    await Array.from(this._subs.values()).map((sub) => sub.start())
  }

  async stop () {
    debug('stopping collaboration %s', this.name)
    this.stats.stop()

    if (this._unregisterObserver) {
      this._unregisterObserver()
    }

    try {
      await Promise.all(Array.from(this._subs.values()).map((sub) => sub.stop()))
    } catch (err) {
      console.error('error stopping sub-collaboration:', err)
    }

    try {
      await Promise.all(Array.from(this._gossips).map((gossip) => gossip.stop()))
    } catch (err) {
      console.error('error stopping gossip:', err)
    }

    try {
      if (this.shared) {
        this.shared.stop()
      }
    } catch (err) {
      console.error('error stopping shared collaboration:', err)
    }

    if (this._isRoot) {
      try {
        await Promise.all([this._membership.stop(), this._store.stop()])
      } catch (err) {
        console.error('error stopping:', err)
      }
    }

    this.emit('stopped')
  }

  peers () {
    return this._membership.peers()
  }

  outboundConnectionCount () {
    return this._membership.outboundConnectionCount()
  }

  outboundConnectedPeers () {
    return this._membership.outboundConnectedPeers()
  }

  inboundConnectionCount () {
    return this._membership.inboundConnectionCount()
  }

  inboundConnectedPeers () {
    return this._membership.inboundConnectedPeers()
  }

  deliverRemoteMembership (membership) {
    return this._membership.deliverRemoteMembership(membership)
  }

  _storeName () {
    return this._isRoot ? null : this.name
  }
}

module.exports.Collaboration = Collaboration

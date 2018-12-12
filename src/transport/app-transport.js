'use strict'

const debug = require('debug')('peer-base:app-transport')
const EventEmitter = require('events')
const ConnectionManager = require('./connection-manager')
const Gossip = require('./gossip')
const Discovery = require('../discovery/discovery')
const GlobalConnectionManager = require('./global-connection-manager')

module.exports = (...args) => new AppTransport(...args)

class AppTransport extends EventEmitter {
  constructor (app, ipfs, transport, options) {
    super()
    this._started = false
    this._app = app
    this._ipfs = ipfs
    this._transport = transport

    this._globalConnectionManager = new GlobalConnectionManager(ipfs, this)

    // This is used by libp2p TransportManager to store listeners
    this.listeners = []

    this.discovery = new Discovery(
      app,
      this._ipfs,
      this._transport.discovery,
      this._globalConnectionManager,
      options)

    this._connectionManager = new ConnectionManager(
      this._ipfs,
      this.discovery,
      this._appTopic(app),
      options)

    this._gossip = Gossip(app.name, ipfs)
    this._gossip.on('error', (err) => this.emit('error', err))
    this._app.setGossip(this._gossip)

    this._app.setGlobalConnectionManager(this._globalConnectionManager)

    this._onPeer = this._onPeer.bind(this)

    // Discovery gets started by libp2p, so once it has started we can start
    // the rest of the transport stack
    this.discovery.on('start', () => this._maybeStart())
    this.discovery.on('stop', () => this.stop())
  }

  dial (ma, options, callback) {
    return this._transport.dial(ma, options, callback)
  }

  createListener (options, handler) {
    return this._transport.createListener(options, handler)
  }

  filter (multiaddrs) {
    return this._transport.filter(multiaddrs)
  }

  needsConnection (peerInfo) {
    return this._connectionManager.needsConnection(peerInfo)
  }

  _maybeStart () {
    if (!this._started) {
      this._started = true
      this._start()
    }
  }

  async _start () {
    this.discovery.on('peer', this._onPeer)
    await this._awaitIpfsStart()
    this._gossip.start()
    this._connectionManager.start()
    this._globalConnectionManager.start()
  }

  async _awaitIpfsStart () {
    return new Promise(resolve => {
      if (this._ipfs._peerInfo) {
        return resolve()
      }
      this._ipfs.once('ready', resolve)
    })
  }

  stop () {
    this.discovery.removeListener('peer', this._onPeer)
    this._connectionManager.stop()
    this._globalConnectionManager.stop()
    this._gossip.stop((err) => {
      if (err) {
        debug('error stopping gossip: ', err)
      }
    })
  }

  _onPeer (peerInfo) {
    this.emit('outbound peer connected', peerInfo)
  }

  _appTopic (app) {
    return app.name
  }
}

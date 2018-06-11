'use strict'

const debug = require('debug')('peer-star:app-transport')
const Ring = require('./ring')
const EventEmitter = require('events')
const Gossip = require('./gossip')
const DiasSet = require('./dias-peer-set')
const PeerSet = require('./peer-set')
const Discovery = require('./discovery')

const PEER_ID_BYTE_COUNT = 32
const PREAMBLE_BYTE_COUNT = 2

module.exports = (...args) => new AppTransport(...args)

class AppTransport extends EventEmitter {
  constructor (app, ipfs, transport) {
    super()
    this._started = false
    this._ipfs = ipfs
    this._transport = transport
    this._app = app

    this._ring = Ring()

    this._ring.on('changed', (peerInfo) => {
      const diasSet = this._keepConnectedToDiasSet()
      if (peerInfo && diasSet.has(peerInfo)) {
        this.discovery.emit('peer', peerInfo)
      }
    })

    this._outboundConnections = new PeerSet()
    this._inboundConnections = new PeerSet()
    this.listeners = []

    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)
    this._onPeerConnect = this._onPeerConnect.bind(this)

    this.discovery = new Discovery(
      this._appTopic(),
      this._ipfs,
      this._transport.discovery,
      this._ring,
      this._inboundConnections,
      this._outboundConnections)

    this.discovery.on('start', () => this._maybeStart())

    this._gossip = Gossip(app.name, ipfs)
    this._gossip.on('error', (err) => this.emit('error', err))
    this._app.setGossip(this._gossip)
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

  close (callback) {
    this._ipfs._libp2pNode.removeListener('peer:disconnect', this._onPeerDisconnect)
    this._gossip.stop((err) => {
      if (err) {
        debug('error stopping gossip: ', err)
      }
      this._transport.close(callback)
    })
  }

  _maybeStart () {
    if (!this._started) {
      this._started = true
      this._start()
    }
  }

  _start () {
    this._startPeerId()
    this._gossip.start()
    this._ipfs._libp2pNode.on('peer:disconnect', this._onPeerDisconnect)
    this._ipfs._libp2pNode.on('peer:connect', this._onPeerConnect)
  }

  _startPeerId () {
    if (this._ipfs._peerInfo) {
      this._diasSet = DiasSet(PEER_ID_BYTE_COUNT, this._ipfs._peerInfo, PREAMBLE_BYTE_COUNT)
    } else {
      this._ipfs.once('ready', this._startPeerId.bind(this))
    }
  }

  _onPeerDisconnect (peerInfo) {
    debug('peer %s disconnected', peerInfo.id.toB58String())
    this._outboundConnections.delete(peerInfo)
    this._inboundConnections.delete(peerInfo)
    if (this._ring.remove(peerInfo)) {
      this._keepConnectedToDiasSet()
      this.emit('peer disconnected', peerInfo)
    }
  }

  _onPeerConnect (peerInfo) {
    debug('peer %s connected', peerInfo.id.toB58String())
    this.emit('peer connected', peerInfo)
    if (!this._outboundConnections.has(peerInfo)) {
      this._inboundConnections.add(peerInfo)
    }
  }

  _keepConnectedToDiasSet () {
    const diasSet = this._diasSet(this._ring)

    // make sure we're connected to every peer of the Dias Peer Set
    for (let peerInfo of diasSet.values()) {
      if (!this._outboundConnections.has(peerInfo)) {
        this._outboundConnections.add(peerInfo)
        this._ipfs._libp2pNode.dial(peerInfo, (err) => {
          if (err) {
            debug('error dialing:', err)
          }
        })
      }
    }

    // make sure we disconnect from peers not in the Dias Peer Set

    // TODO: keep inbound connections alive. we just want to redefine the outbound connections,
    // not the inbound ones.
    for (let peerInfo of this._outboundConnections.values()) {
      if (!diasSet.has(peerInfo)) {
        this._ipfs._libp2pNode.hangUp(peerInfo, (err) => {
          if (err) {
            this.emit('error', err)
          }
        })
      }
    }

    return diasSet
  }

  _appTopic () {
    return this._app.name
  }
}

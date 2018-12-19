'use strict'

const debug = require('debug')('peer-base:connection-manager')
const EventEmitter = require('events')
const Ring = require('../common/ring')
const DiasSet = require('../common/dias-peer-set')
const PeerSet = require('../common/peer-set')
const debounce = require('lodash/debounce')

const defaultOptions = {
  peerIdByteCount: 32,
  preambleByteCount: 2,
  debounceResetConnectionsMS: 1000
}

module.exports = class ConnectionManager extends EventEmitter {
  constructor (ipfs, dialer, discovery, globalConnectionManager, options) {
    super()

    this._options = Object.assign({}, defaultOptions, options)

    this._ipfs = ipfs
    this._dialer = dialer
    this._discovery = discovery
    this._globalConnectionManager = globalConnectionManager
    this._ring = Ring(this._options.preambleByteCount)
    this._connections = new PeerSet()
    this._running = false

    this._onDialed = this._onDialed.bind(this)
    this._onPeerInterest = this._onPeerInterest.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)
    this._debouncedResetConnections = debounce(
      this._resetConnections.bind(this), this._options.debounceResetConnectionsMS)

    this._discovery.setConnectionManager(this)
  }

  start () {
    this._diasSet = DiasSet(this._options.peerIdByteCount, this._ipfs._peerInfo, this._options.preambleByteCount)
    this._ipfs._libp2pNode.on('peer:disconnect', this._onPeerDisconnect)
    this._discovery.on('peer:interest', this._onPeerInterest)
    this._dialer.on('dialed', this._onDialed)
    this._dialer.start()
    this._running = true
  }

  stop () {
    this._running = false
    this._ipfs._libp2pNode.removeListener('peer:disconnect', this._onPeerDisconnect)
    this._discovery.removeListener('peer:interest', this._onPeerInterest)
    this._dialer.removeListener('dialed', this._onDialed)

    for (let peerInfo of this._connections.values()) {
      this._disconnectPeer(peerInfo)
    }
    this._connections = new PeerSet()
    this._ring = Ring(this._options.preambleByteCount)
  }

  get connections () {
    return new PeerSet(this._connections)
  }

  hasConnection (peerInfo) {
    return this._connections.has(peerInfo)
  }

  needsConnection (peerInfo) {
    return this._diasSet(this._ring).has(peerInfo)
  }

  _onPeerInterest (peerInfo, isInterested) {
    const id = peerInfo.id.toB58String()
    if (isInterested) {
      // If peer is interested, a connection has already been created
      this._connections.add(peerInfo)
      if (this._ring.has(peerInfo)) {
        debug('peer %s discovered but we already knew about it, ignoring', id)
      } else {
        debug('peer %s is interested in app, adding to ring', id)
        this._ring.add(peerInfo)
      }
    } else {
      // Note: If peer is not interested, PeerInterestDiscovery will hang it up
      // for us
      if (this._ring.has(peerInfo)) {
        // Make sure the peer is not in the ring
        debug('peer %s is not interested in app, removing from ring', id)
        this._ring.remove(peerInfo)
      } else {
        debug('peer %s is not interested in app, ignoring', id)
      }
    }
    this._debouncedResetConnections()
  }

  // Called whenever a peer is discovered
  _resetConnections () {
    const diasSet = this._diasSet(this._ring)

    // Make sure we're connected to every peer of the Dias Peer Set and
    // disconnect from any other peer
    for (let peerInfo of diasSet.values()) {
      if (!this._connections.has(peerInfo)) {
        this._dialPeer(peerInfo)
      }
    }

    for (let peerInfo of this._connections.values()) {
      if (!diasSet.has(peerInfo)) {
        this._disconnectPeer(peerInfo)
      }
    }
  }

  _dialPeer (peerInfo) {
    if (!this._running) {
      debug('ignoring dial - connection manager has stopped', peerInfo.id.toB58String())
    }

    this._dialer.dial(peerInfo, (ignoreErr, complete) => {
      if (complete) {
        this._connections.add(peerInfo)
      }
    }, 0, false) // don't redial on error
  }

  _disconnectPeer (peerInfo) {
    if (this._connections.has(peerInfo)) {
      debug('disconnecting peer %s', peerInfo.id.toB58String())
      this._connections.delete(peerInfo)
    }
    this._dialer.cancelDial(peerInfo)
    this._globalConnectionManager.maybeHangUp(peerInfo)
  }

  _onPeerDisconnect (peerInfo) {
    // Note that if the peer was disconnected on purpose by the local node it
    // will already have have been removed from the outbound connections set,
    // so here we're only removing it from the ring when there is an unexpected
    // disconnect
    if (this._connections.has(peerInfo)) {
      this.emit('disconnect:unexpected', peerInfo)

      // Remove the peer from the ring
      debug('peer %s disconnected, removing from ring', peerInfo.id.toB58String())
      this._connections.delete(peerInfo)
      this._ring.remove(peerInfo)
      this._debouncedResetConnections()
    }
  }

  // This gets triggered by Discovery dials and by our own dials
  _onDialed (peerInfo, err) {
    if (err) {
      this.emit('disconnect:unexpected', peerInfo)

      // Dial failure trying to connect to a peer so remove it from the ring
      // and hang up
      debug('peer %s dial failure, removing from ring', peerInfo.id.toB58String())
      this._connections.delete(peerInfo)
      this._ring.remove(peerInfo)
      this._globalConnectionManager.maybeHangUp(peerInfo)
      this._debouncedResetConnections()
    }
  }
}

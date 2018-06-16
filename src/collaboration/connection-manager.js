'use strict'

const debug = require('debug')('peer-star:collaboration-connection-manager')
const debounce = require('lodash.debounce')
const PeerSet = require('../common/peer-set')
const Protocol = require('./protocol')

module.exports = class ConnectionManager {
  constructor (ipfs, ring, collaboration, options) {
    this._ipfs = ipfs
    this._options = options

    this._stopped = true
    this._newPeers = []

    this._ring = ring
    this._ring.on('changed', this._onRingChange.bind(this))

    this._inboundConnections = new PeerSet()
    this._outboundConnections = new PeerSet()

    this._protocol = Protocol(collaboration)

    this._protocol.on('inbound connection', (peerInfo) => {
      this._inboundConnections.add(peerInfo)
      this._ring.add(peerInfo)
    })

    this._protocol.on('inbound connection closed', (peerInfo) => {
      this._inboundConnections.delete(peerInfo)
      if (!this._outboundConnections.has(peerInfo)) {
        this._ring.remove(peerInfo)
      }
    })

    this._protocol.on('outbound connection', (peerInfo) => {
      this._outboundConnections.add(peerInfo)
    })

    this._protocol.on('outbound connection closed', (peerInfo) => {
      this._outboundConnections.delete(peerInfo)
      if (!this._inboundConnections.has(peerInfo)) {
        this._ring.remove(peerInfo)
      }
    })

    this._debouncedResetConnections = debounce(
      this._resetConnections.bind(this), this._options.debounceResetConnectionsMS)
  }

  start (diasSet) {
    this._stopped = false
    this._diasSet = diasSet

    this._ipfs._libp2pNode.handle(this._protocol.name(), this._protocol.handler)
  }

  stop () {
    this._stopped = true
    this._ipfs._libp2pNode.unhandle(this._protocol.name())
  }

  _onRingChange () {
    this._debouncedResetConnections()
  }

  _resetConnections () {
    const diasSet = this._diasSet(this._ring)

    console.log('dias set has %d peers', diasSet.size)

    // make sure we're connected to every peer of the Dias Peer Set
    for (let peerInfo of diasSet.values()) {
      if (!this._outboundConnections.has(peerInfo)) {
        this._ipfs._libp2pNode.dialProtocol(
          peerInfo, this._protocol.name(), this._protocol.dialerFor(peerInfo))
      }
    }

    // make sure we disconnect from peers not in the Dias Peer Set
    for (let peerInfo of this._outboundConnections.values()) {
      if (!diasSet.has(peerInfo)) {
        try {
          this._protocol.hangup(peerInfo)
        } catch (err) {
          debug('error hanging up:', err)
        }
      }
    }
  }
}

'use strict'

const debug = require('debug')('peer-star:connection-manager')
const EventEmitter = require('events')

module.exports = class ConnectionManager extends EventEmitter {
  constructor (ipfs, ring, inboundConnections, outboundConnections) {
    super()
    this._ipfs = ipfs
    this._ring = ring
    this._inboundConnections = inboundConnections
    this._outboundConnections = outboundConnections

    this._onRingChange = this._onRingChange.bind(this)
    this._ring.on('change', this._onRingChange)
  }

  start (diasSet) {
    this._diasSet = diasSet
  }

  stop () {

  }

  _onRingChange (peerInfo) {
    const diasSet = this._keepConnectedToDiasSet()
    if (peerInfo && diasSet.has(peerInfo)) {
      this.emit('peer', peerInfo)
    }
  }

  _keepConnectedToDiasSet () {
    const diasSet = this._diasSet(this._ring)

    // make sure we're connected to every peer of the Dias Peer Set
    for (let peerInfo of diasSet.values()) {
      if (!this._outboundConnections.has(peerInfo)) {
        this._outboundConnections.add(peerInfo)
        // emitting a peer should be enough to make us connected
        // this event will be relayed to the discovery
        // which will make IPFS connect to the peer
        this.emit('peer', peerInfo)
      }
    }

    // make sure we disconnect from peers not in the Dias Peer Set

    // TODO: keep inbound connections alive. we just want to redefine the outbound connections,
    // not the inbound ones.
    for (let peerInfo of this._outboundConnections.values()) {
      if (!diasSet.has(peerInfo)) {
        try {
          this._ipfs._libp2pNode.hangUp(peerInfo, (err) => {
            if (err) {
              debug('error hanging up:', err)
            }
          })
        } catch (err) {
          debug('error hanging up:', err)
        }
      }
    }

    return diasSet
  }
}

'use strict'

const debug = require('debug')('peer-star:collaboration:connection-manager')
const debounce = require('lodash.debounce')
const PeerSet = require('../common/peer-set')
const Protocol = require('./protocol')

module.exports = class ConnectionManager {
  constructor (ipfs, globalConnectionManager, ring, collaboration, store, options) {
    this._ipfs = ipfs
    this._globalConnectionManager = globalConnectionManager
    this._options = options

    this._stopped = true
    this._newPeers = []

    this._ring = ring
    this._ring.on('changed', this._onRingChange.bind(this))

    this._inboundConnections = new PeerSet()
    this._outboundConnections = new PeerSet()

    this._protocol = Protocol(ipfs, collaboration, store)

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

  async start (diasSet) {
    this._stopped = false
    this._diasSet = diasSet

    await this._globalConnectionManager.handle(this._protocol.name(), this._protocol.handler)
  }

  stop () {
    this._stopped = true
    this._globalConnectionManager.unhandle(this._protocol.name())
  }

  _onRingChange () {
    this._debouncedResetConnections()
  }

  _resetConnections () {
    return new Promise(async (resolve, reject) => {
      const diasSet = this._diasSet(this._ring)

      // make sure we're connected to every peer of the Dias Peer Set
      for (let peerInfo of diasSet.values()) {
        if (!this._outboundConnections.has(peerInfo)) {
          try {
            const connection = await this._globalConnectionManager.connect(
              peerInfo, this._protocol.name())
            this._protocol.dialerFor(peerInfo, connection)
          } catch (err) {
            console.log('error connecting:', err.message)
            debug('error connecting:', err)
          }
        }
      }

      // make sure we disconnect from peers not in the Dias Peer Set
      for (let peerInfo of this._outboundConnections.values()) {
        if (!diasSet.has(peerInfo)) {
          try {
            this._globalConnectionManager.disconnect(peerInfo, this._protocol.name())
          } catch (err) {
            debug('error hanging up:', err)
          }
        }
      }
    })
  }
}

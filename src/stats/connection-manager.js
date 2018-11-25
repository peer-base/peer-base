/* eslint no-console: "off" */
'use strict'

const debug = require('debug')('peer-star:collaboration:stats:connection-manager')
const Protocol = require('./stats-protocol')
const PeerSet = require('../common/peer-set')

class CollaborationStatsConnectionManager {
  constructor (ipfs, collaboration, collabConnectionManager, globalConnectionManager, stats) {
    this._collaboration = collaboration
    this._collabConnectionManager = collabConnectionManager
    this._globalConnectionManager = globalConnectionManager
    this._onConnectionsChanged = this._onConnectionsChanged.bind(this)

    this._connectedTo = new PeerSet()
    this._pullingEnabled = false

    this._protocol = new Protocol(ipfs, collaboration, stats)
    this._protocol.on('puller count changed', (pullerCount) => {
      debug('%s: puller count changed to %d', ipfs._peerInfo.id.toB58String(), pullerCount)
      if (pullerCount) {
        this.enablePulling()
      } else {
        this.disablePulling()
      }
    })
  }

  start () {
    this._startHandler()
  }

  enablePulling () {
    if (!this._pullingEnabled) {
      debug('enabling pulling...')
      this._pullingEnabled = true
      this._collabConnectionManager.on('connected', this._onConnectionsChanged)
      this._collabConnectionManager.on('disconnected', this._onConnectionsChanged)
      this._syncConnections().catch((err) => {
        debug('error syncing connections:', err)
        console.error('error syncing connections:', err.message)
      })
    }
  }

  disablePulling () {
    if (this._pullingEnabled) {
      debug('disabling pulling...')
      this._pullingEnabled = false
      this._collabConnectionManager.removeListener('connected', this._onConnectionsChanged)
      this._collabConnectionManager.removeListener('disconnected', this._onConnectionsChanged)
    }
  }

  stop () {
    this.disablePulling()
    this._stopHandler()
    this._disconnectAll()
  }

  _startHandler () {
    this._globalConnectionManager.handle(this._protocol.name(), this._protocol.handler.bind(this._protocol))
  }

  _stopHandler () {
    this._globalConnectionManager.unhandle(this._protocol.name())
  }

  _onConnectionsChanged () {
    if (!this._pullingEnabled) {
      return
    }
    this._syncConnections().catch((err) => {
      debug('error in stats connection manager:', err)
      console.error('error in stats connection manager:', err.message)
    })
  }

  async _syncConnections () {
    const outboundConnections = this._collabConnectionManager.outboundConnectedPeerInfos()

    // connect stats to peers we're connected to
    for (let peer of outboundConnections.values()) {
      if (!this._connectedTo.has(peer)) {
        const connection = await this._globalConnectionManager.connect(
          peer, this._protocol.name())
        this._connectedTo.add(peer)
        connection.once('closed', () => {
          this._connectedTo.delete(peer)
        })
        this._protocol.dialerFor(peer, connection)
      }
    }

    for (let peer of this._connectedTo.values()) {
      if (!outboundConnections.has(peer)) {
        this._globalConnectionManager.disconnect(peer, this._protocol.name())
      }
    }
  }

  _disconnectAll () {
    for (let peer of this._connectedTo.values()) {
      this._globalConnectionManager.disconnect(peer, this._protocol.name())
    }
  }
}

module.exports = CollaborationStatsConnectionManager

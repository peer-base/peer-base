'use strict'

const debug = require('debug')('peer-star:connection-manager')
const EventEmitter = require('events')
const PeerInterestDiscovery = require('../discovery/peer-interest-discovery')
const Ring = require('../common/ring')
const DiasSet = require('../common/dias-peer-set')
const debounce = require('lodash/debounce')

const defaultOptions = {
  peerIdByteCount: 32,
  preambleByteCount: 2,
  debounceResetConnectionsMS: 1000
}

module.exports = class ConnectionManager extends EventEmitter {
  constructor (ipfs, discovery, topicName, options) {
    super()

    this._options = Object.assign({}, defaultOptions, options)

    this._ipfs = ipfs
    this._discovery = discovery
    this._ring = Ring(this._options.preambleByteCount)

    this._peerInterestDiscovery = new PeerInterestDiscovery(ipfs, topicName)
    this._peerIsInterested = this._peerIsInterested.bind(this)

    this._onDisconnect = this._onDisconnect.bind(this)
    this._debouncedResetConnections = debounce(
      this._resetConnections.bind(this), this._options.debounceResetConnectionsMS)
  }

  start () {
    this._diasSet = DiasSet(this._options.peerIdByteCount, this._ipfs._peerInfo, this._options.preambleByteCount)
    this._ring.on('changed', this._debouncedResetConnections)
    this._discovery.on('disconnect', this._onDisconnect)
    this._peerInterestDiscovery.on('peer', this._peerIsInterested)
    this._peerInterestDiscovery.start()
  }

  stop () {
    this._peerInterestDiscovery.stop()
    this._peerInterestDiscovery.removeListener('peer', this._peerIsInterested)
    this._ring.removeListener('changed', this._debouncedResetConnections)
    this._discovery.removeListener('disconnect', this._onDisconnect)
  }

  needsConnection (peerInfo) {
    return this._diasSet(this._ring).has(peerInfo)
  }

  _peerIsInterested (peerInfo, isInterested) {
    const id = peerInfo.id.toB58String()
    if (isInterested) {
      if (!this._ring.has(peerInfo)) {
        debug('peer %s is interested in app, adding to ring', id)
        this._ring.add(peerInfo)
      }
      return
    }
    // Make sure the peer is not in the ring
    debug('peer %s is not interested in app, removing from ring', id)
    this._ring.remove(peerInfo)
  }

  // Note: this only fires when a peer we have an outbound connection to
  // disconnects
  _onDisconnect (peerInfo) {
    // Remove the peer from the ring
    debug('peer %s disconnected', peerInfo.id.toB58String())
    this._ring.remove(peerInfo)
  }

  _resetConnections () {
    this._discovery.resetConnections(this._diasSet(this._ring))
  }
}

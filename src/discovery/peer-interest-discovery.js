'use strict'

const debug = require('debug')('peer-base:discovery:peer-interest')
const EventEmitter = require('events')

const defaultOptions = {
  // Wait this amount of time to find out from floodsub if a peer we discovered
  // is interested in our app topic
  peerInterestTimeoutMS: 30 * 1000
}

// Listen to floodsub to find out if a peer is interested in our app topic
module.exports = class PeerInterestDiscovery extends EventEmitter {
  constructor (ipfs, _globalConnectionManager, appTopic, options) {
    super()

    this._options = Object.assign({}, defaultOptions, options)

    this._ipfs = ipfs
    this._globalConnectionManager = _globalConnectionManager
    this._appTopic = appTopic
    this._running = false
    this._peers = new Map()

    this._onSubscriptionChange = this._onSubscriptionChange.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)
  }

  start () {
    debug('start')
    this._running = true
    this._ipfs._libp2pNode._floodSub.on('floodsub:subscription-change', this._onSubscriptionChange)
    this._ipfs._libp2pNode.on('peer:disconnect', this._onPeerDisconnect)
  }

  stop () {
    debug('stop')
    this._ipfs._libp2pNode._floodSub.removeListener('floodsub:subscription-change', this._onSubscriptionChange)
    this._ipfs._libp2pNode.removeListener('peer:disconnect', this._onPeerDisconnect)
    for (const [id, peer] of this._peers) {
      this._clearTimer(id)
      this._globalConnectionManager.maybeHangUp(peer.peerInfo)
    }
    this._running = false
  }

  _onSubscriptionChange (peerInfo, topics, subs) {
    const id = peerInfo.id.toB58String()
    debug('floodsub change:', id, topics, subs)
    const isInterested = topics.has(this._appTopic)
    this.emit('peer', peerInfo, isInterested)

    // We got a response, so clean up the timer
    this._clearTimer(id)

    // If the peer is not interested in our topic, we can hang up
    if (!isInterested) {
      this._globalConnectionManager.maybeHangUp(peerInfo)
    }
  }

  needsConnection (peerInfo) {
    if (!this._running) return false

    const id = peerInfo.id.toB58String()
    return this._peers.has(id)
  }

  add (peerInfo) {
    const id = peerInfo.id.toB58String()
    if (!this._peers.has(id)) {
      const timeout = setTimeout(() => {
        // If the timeout expires before finding out if the peer is interested
        // in our topic, disconnect from the peer
        this._clearTimer(id)
        this._globalConnectionManager.maybeHangUp(peerInfo)
      }, this._options.peerInterestTimeoutMS)
      this._peers.set(id, { timeout, peerInfo })
    }
  }

  _onPeerDisconnect (peerInfo) {
    const id = peerInfo.id.toB58String()
    this._clearTimer(id)
  }

  _clearTimer (id) {
    const peer = this._peers.get(id)
    if (peer && peer.timeout) {
      clearTimeout(peer.timeout)
    }
    this._peers.delete(id)
  }
}

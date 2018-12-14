'use strict'

const debug = require('debug')('peer-base:discovery')
const EventEmitter = require('events')
const DialCache = require('./dial-cache')
const DialThrottle = require('./dial-throttle')
const PeerInterestDiscovery = require('../discovery/peer-interest-discovery')

// The peerDiscovery emitter emits 'peer' events when a new peer is discovered.
// This class listens for those events and dials the peer.
// When the dial completes, libp2p emits a 'peer:connect' event which causes
// floodsub to dial the peer and ask for its topics. Floodsub emits an event on
// receiving changes to a peer's topics. PeerInterestDiscovery listens for the
// event and emits a 'peer' event indicating if the remote peer is interested
// in the local peer's app topic.
module.exports = class Discovery extends EventEmitter {
  constructor (app, ipfs, dialer, peerDiscovery, globalConnectionManager, options = {}) {
    super()

    this._ipfs = ipfs
    this._dialer = dialer
    this._discovery = peerDiscovery

    this._timeouts = new Map()
    this._running = false

    this._dialCache = new DialCache(options)
    this._dialThrottle = new DialThrottle(app, options)
    this._peerInterestDiscovery = new PeerInterestDiscovery(ipfs, globalConnectionManager, app.name, options)

    this._dialPeer = this._dialPeer.bind(this)
    this._peerIsInterested = this._peerIsInterested.bind(this)
    this._onUnexpectedDisconnect = this._onUnexpectedDisconnect.bind(this)

    // Start peer discovery immediately so that we don't miss any events that
    // come in before we've started.
    // Note: some transports (eg WebSocketStar) start immediately when
    // constructed
    this._discovery.on('peer', this._dialPeer)
  }

  // Both Discovery and ConnectionManager need references to each other
  setConnectionManager (mgr) {
    this._connectionManager = mgr
  }

  // Called by libp2p when it starts
  start (callback) {
    debug('start')
    this._peerInterestDiscovery.on('peer', this._peerIsInterested)
    this._peerInterestDiscovery.start()
    this._connectionManager.on('disconnect:unexpected', this._onUnexpectedDisconnect)
    this._dialer.start()
    this._running = true
    this.emit('start')
    return this._discovery.start(callback)
  }

  // Called by libp2p when it stops
  stop (callback) {
    debug('stop')
    this._running = false
    for (const timeout of this._timeouts.values()) {
      clearTimeout(timeout)
    }
    this._timeouts.clear()
    this._peerInterestDiscovery.stop()
    this._peerInterestDiscovery.removeListener('peer', this._peerIsInterested)
    this._discovery.removeListener('peer', this._dialPeer)
    this._peerInterestDiscovery.removeListener('disconnect:unexpected', this._onUnexpectedDisconnect)

    // Note: When 'stop' is fired, ConnectionManager will clean up the
    // connections
    this.emit('stop')
    return this._discovery.stop(callback)
  }

  needsConnection (peerInfo) {
    return this._peerInterestDiscovery.needsConnection(peerInfo)
  }

  async _dialPeer (peerInfo) {
    // We start listening for 'peer' events before start so wait till start
    // to actually process them
    await this._awaitStart()

    // Check if discovery was stopped
    const id = peerInfo.id.toB58String()
    if (!this._running) {
      debug('not dialing peer %s because discovery has stopped', id)
      return
    }

    // Don't dial peers we're already connected to
    if (this._connectionManager.hasConnection(peerInfo) || this._peerInterestDiscovery.needsConnection(peerInfo)) {
      debug('not dialing peer %s because already have a connection to it', id)
      return
    }

    // Don't redial peers we're currently dialing
    if (this._timeouts.has(id) || this._dialer.dialing(peerInfo)) {
      debug("not redialing peer %s because we're already dialing it", id)
    }

    // Don't dial peers we've dialed recently
    const fresh = this._dialCache.add(peerInfo)
    if (!fresh) return

    const delay = this._dialThrottle.getDialDelay()
    debug('discovered peer %s - dialing in %dms', id, delay)
    const timeout = setTimeout(async () => {
      this._timeouts.delete(id)

      // Check if discovery was stopped
      if (!this._running) {
        debug('not dialing peer %s because discovery has stopped', id)
        return
      }

      // Dial
      debug('dialing peer %s', id)
      this._dialer.dial(peerInfo, (ignore, completed) => {
        if (completed && this._running) {
          debug('connected to peer %s', id)
          this.emit('peer', peerInfo)
          this._peerInterestDiscovery.add(peerInfo)
        }
      })
    }, delay)
    this._timeouts.set(id, timeout)
  }

  // Fired by ConnectionManager
  _onUnexpectedDisconnect (peerInfo) {
    // Make sure we can immediately redial the peer if it unexpectedly
    // disconnects
    this._dialCache.remove(peerInfo)
  }

  _peerIsInterested (peerInfo, isInterested) {
    this.emit('peer:interest', peerInfo, isInterested)
  }

  _awaitStart () {
    return new Promise(async resolve => {
      // Make sure libp2p has started
      await this._awaitLibp2pStart()

      if (this._running) {
        return resolve()
      }
      this.once('start', resolve)
    })
  }

  _awaitLibp2pStart () {
    return new Promise(resolve => {
      if (this._ipfs._libp2pNode.isStarted()) {
        return resolve()
      }
      this._ipfs._libp2pNode.once('start', resolve)
    })
  }
}

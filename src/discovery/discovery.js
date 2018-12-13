'use strict'

const debug = require('debug')('peer-base:discovery')
const EventEmitter = require('events')
const DialCache = require('./dial-cache')
const DialThrottle = require('./dial-throttle')
const Dialer = require('./dialer')
const PeerSet = require('../common/peer-set')

// The peerDiscovery emitter emits 'peer' events when a new peer is discovered.
// This class listens for those events and dials the peer.
// When the dial completes, libp2p emits a 'peer:connect' event which causes
// floodsub to dial the peer and ask for its topics. Floodsub emits an event on
// receiving changes to a peer's topics. PeerInterestDiscovery listens for the
// event and emits a 'peer' event indicating if the remote peer is interested
// in the local peer's app topic.
module.exports = class Discovery extends EventEmitter {
  constructor (app, ipfs, peerDiscovery, globalConnectionManager, options = {}) {
    super()

    this._ipfs = ipfs
    this._discovery = peerDiscovery
    this._globalConnectionManager = globalConnectionManager
    this._options = options

    this._connections = new PeerSet()
    this._timeouts = new Map()
    this._running = false

    this._dialCache = new DialCache(options)
    this._dialThrottle = new DialThrottle(app, options)

    this._dialPeer = this._dialPeer.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)

    // Start peer discovery immediately so that we don't miss any events that
    // come in before we've started.
    // Note: some transports (eg WebSocketStar) start immediately when
    // constructed
    this._discovery.on('peer', this._dialPeer)
  }

  start (callback) {
    debug('start')
    this._ipfs._libp2pNode.on('peer:disconnect', this._onPeerDisconnect)
    this._running = true
    this.emit('start')
    return this._discovery.start(callback)
  }

  stop (callback) {
    debug('stop')
    this._running = false
    this._connections.clear()
    for (const timeout of this._timeouts.values()) {
      clearTimeout(timeout)
    }
    this._timeouts.clear()
    this._dialer && this._dialer.stop()
    this._ipfs._libp2pNode.removeListener('peer:disconnect', this._onPeerDisconnect)
    this._discovery.removeListener('peer', this._dialPeer)

    // Note: When 'stop' is fired, AppTransport will stop the connection
    // manager, which will call Discovery.resetConnections() with an empty dias
    // set, cleaning up the remaining connections
    this.emit('stop')
    return this._discovery.stop(callback)
  }

  hasConnection (peerInfo) {
    return this._connections.has(peerInfo)
  }

  get connections () {
    return new PeerSet(this._connections)
  }

  resetConnections (diasSet) {
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

    // Don't redial peers we're currently dialing
    if (this._timeouts.has(id) || this._getDialer().dialing(peerInfo)) {
      debug("not redialing peer %s because we're already dialing it", id)
    }

    // Don't dial peers we've dialed recently
    const fresh = this._dialCache.add(peerInfo)
    if (!fresh) return

    // Don't dial peers we're already connected to
    if (this._connections.has(peerInfo)) {
      debug('not dialing peer %s because already have a connection to it', id)
      return
    }

    const delay = this._dialThrottle.getDialDelay()
    debug('discovered peer %s - dialing in %dms', id, delay)
    const timeout = setTimeout(async () => {
      this._timeouts.delete(id)

      // Check if discovery was stopped
      if (!this._running) {
        debug('not dialing peer %s because discovery has stopped', id)
        return
      }

      // Make sure libp2p has started
      await this._awaitLibp2pStart()

      // Check (again) if discovery was stopped
      if (!this._running) {
        debug('not dialing peer %s because discovery has stopped', id)
        return
      }

      // Don't dial peers we're already connected to
      if (this._connections.has(peerInfo)) {
        debug('not dialing peer %s because already have a connection to it', id)
        return
      }

      // Dial
      debug('dialing peer %s', id)
      this._getDialer().dial(peerInfo, (err, completed) => {
        if (completed && this._running) {
          debug('connected to peer %s', id)
          this._connections.add(peerInfo)
          this.emit('peer', peerInfo)
        }

        this.emit('dialed', peerInfo, err, completed)
      })
    }, delay)
    this._timeouts.set(id, timeout)
  }

  _onPeerDisconnect (peerInfo) {
    // Make sure we can immediately redial the peer on disconnect
    this._dialCache.remove(peerInfo)

    // Note that if the peer was disconnected on purpose by the local node it
    // will already have have been removed from the outbound connections set,
    // so here we're only emiting when there is an unexpected disconnect
    if (this._connections.has(peerInfo)) {
      this.emit('outbound:disconnect', peerInfo)
    }
  }

  _disconnectPeer (peerInfo) {
    if (this._connections.has(peerInfo)) {
      debug('disconnecting peer %s', peerInfo.id.toB58String())
      this._connections.delete(peerInfo)
    }
    this._cancelDial(peerInfo)
    this._globalConnectionManager.maybeHangUp(peerInfo)
  }

  _cancelDial (peerInfo) {
    if (!this._running) return

    this._getDialer().cancelDial(peerInfo)
    const id = peerInfo.id.toB58String()
    clearTimeout(this._timeouts.get(id))
    this._timeouts.delete(id)
  }

  _getDialer () {
    if (!this._dialer) {
      this._dialer = new Dialer(this._ipfs._libp2pNode, this._options)
      this.once('stop', () => {
        this._dialer.stop()
        this._dialer = null
      })
    }
    return this._dialer
  }

  _awaitStart () {
    return new Promise(resolve => {
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

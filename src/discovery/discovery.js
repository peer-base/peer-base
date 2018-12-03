'use strict'

const debug = require('debug')('peer-star:discovery')
const EventEmitter = require('events')
const PeerInterestDiscovery = require('./peer-interest-discovery')
const DialCache = require('./dial-cache')
const DialThrottle = require('./dial-throttle')

// The peerDiscovery emitter emits 'peer' events when a new peer is discovered.
// This class listens for those events and dials the peer.
// When the dial completes, libp2p emits a 'peer:connect' event which causes
// floodsub to dial the peer and ask for its topics. Floodsub emits an event on
// receiving changes to a peer's topics. PeerInterestDiscovery listens for the
// event and emits a 'peer' event indicating if the remote peer is interested
// in the local peer's app topic.
module.exports = class Discovery extends EventEmitter {
  constructor (app, appTopic, ipfs, peerDiscovery, ring, options = {}) {
    super()

    this._ipfs = ipfs
    this._discovery = peerDiscovery
    this._ring = ring
    this._running = false

    this._peerInterestDiscovery = new PeerInterestDiscovery(ipfs, appTopic)
    this._dialCache = new DialCache(options)
    this._dialThrottle = new DialThrottle(app, options)

    this._peerIsInterested = this._peerIsInterested.bind(this)
    this._peerDiscovered = this._peerDiscovered.bind(this)

    // Start peer discovery immediately so that we don't miss any events that
    // come in before we've started.
    // Note: some transports (eg WebSocketStar) start immediately when
    // constructed
    this._discovery.on('peer', this._peerDiscovered)
  }

  start (callback) {
    debug('starting discovery')
    this._running = true
    this._peerInterestDiscovery.on('peer', this._peerIsInterested)
    this._peerInterestDiscovery.start()
    this.emit('start')
    return this._discovery.start(callback)
  }

  stop (callback) {
    debug('stopping discovery')
    this._running = false
    this._peerInterestDiscovery.stop()
    this._peerInterestDiscovery.removeListener('peer', this._peerIsInterested)
    this._discovery.removeListener('peer', this._peerDiscovered)
    this.emit('stop')
    return this._discovery.stop(callback)
  }

  async _peerDiscovered (peerInfo) {
    // We start listening for 'peer' events before start so wait till start
    // to actually process them
    await this._awaitStart()

    // Don't dial peers we've dialed recently
    const fresh = this._dialCache.add(peerInfo)
    if (!fresh) return

    const delay = this._dialThrottle.getDialDelay()
    const id = peerInfo.id.toB58String()
    debug('discovered peer %s - dialing in %dms', id, delay)
    setTimeout(async () => {
      if (this._running) {
        debug('dialing peer %s', id)

        // Make sure libp2p has started
        await this._awaitLibp2pStart()

        this._ipfs._libp2pNode.dial(peerInfo, err => {
          // If there was a dial error, allow further attempts
          if (err) {
            this._dialCache.remove(peerInfo)
          }
        })
      }
    }, delay)
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

  _peerIsInterested (peerInfo, isInterested) {
    if (isInterested) {
      if (!this._ring.has(peerInfo)) {
        debug('peer %s is interested in app, adding to ring', peerInfo.id.toB58String())
        this._ring.add(peerInfo)
      }
      return
    }
    // Make sure the peer is not in the ring.
    // Note: The transport connection manager will detect the ring change and
    // ask the global connection manager to disconnect from the peer.
    this._ring.remove(peerInfo)
  }
}

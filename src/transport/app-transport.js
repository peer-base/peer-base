'use strict'

const debug = require('debug')('peer-star:app-transport')
const Ring = require('./ring')
const EventEmitter = require('events')
const Gossip = require('./gossip')
const DiasSet = require('./dias-peer-set')
const PeerSet = require('./peer-set')

const PEER_ID_BYTE_COUNT = 32
const PREAMBLE_BYTE_COUNT = 2

module.exports = (...args) => new AppTransport(...args)

class AppTransport extends EventEmitter {
  constructor (app, ipfs, transport) {
    super()
    this._started = false
    this._ipfs = ipfs
    this._transport = transport
    this._app = app

    this._ring = Ring()
    this._outboundConnections = new PeerSet()
    this._inboundConnections = new PeerSet()
    this.listeners = []

    this._peerDiscovered = this._peerDiscovered.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)
    this._onPeerConnect = this._onPeerConnect.bind(this)

    this.discovery = new EventEmitter()
    this.discovery.start = (callback) => {
      this._maybeStart()
      debug('starting discovery')
      this._transport.discovery.on('peer', this._peerDiscovered)
      return this._transport.discovery.start(callback)
    }
    this.discovery.stop = (callback) => {
      debug('stopping discovery')
      this._transport.discovery.removeListener('peer', this._peerDiscovered)
      return this._transport.discovery.stop(callback)
    }

    this._gossip = Gossip(app.name, ipfs)
    this._gossip.on('error', (err) => this.emit('error', err))
    this._app.setGossip(this._gossip)
  }

  dial (ma, options, callback) {
    return this._transport.dial(ma, options, callback)
  }

  createListener (options, handler) {
    return this._transport.createListener(options, handler)
  }

  filter (multiaddrs) {
    return this._transport.filter(multiaddrs)
  }

  close (callback) {
    this._ipfs._libp2pNode.removeListener('peer:disconnect', this._onPeerDisconnect)
    this._gossip.stop((err) => {
      if (err) {
        debug('error stopping gossip: ', err)
      }
      this._transport.close(callback)
    })
  }

  _maybeStart () {
    if (!this._started) {
      this._started = true
      this._start()
    }
  }

  _start () {
    this._startPeerId()
    this._gossip.start()
    this._ipfs._libp2pNode.on('peer:disconnect', this._onPeerDisconnect)
    this._ipfs._libp2pNode.on('peer:connect', this._onPeerConnect)
  }

  _startPeerId () {
    if (this._ipfs._peerInfo) {
      this._diasSet = DiasSet(PEER_ID_BYTE_COUNT, this._ipfs._peerInfo, PREAMBLE_BYTE_COUNT)
    } else {
      this._ipfs.once('ready', this._startPeerId.bind(this))
    }
  }

  _onPeerDisconnect (peerInfo) {
    debug('peer %s disconnected', peerInfo.id.toB58String())
    this._outboundConnections.delete(peerInfo)
    this._inboundConnections.delete(peerInfo)
    if (this._ring.remove(peerInfo)) {
      this._keepConnectedToDiasSet()
      this.emit('peer disconnected', peerInfo)
    }
  }

  _onPeerConnect (peerInfo) {
    debug('peer %s connected', peerInfo.id.toB58String())
    this.emit('peer connected', peerInfo)
    if (!this._outboundConnections.has(peerInfo)) {
      this._inboundConnections.add(peerInfo)
    }
  }

  _peerDiscovered (peerInfo) {
    // TODO: refactor this, PLEASE!
    debug('peer discovered %j', peerInfo)

    this._isInterestedInApp(peerInfo)
      .then((isInterestedInApp) => {
        if (isInterestedInApp) {
          debug('peer %s is interested:', peerInfo.id.toB58String())
          this._ring.add(peerInfo)
          const diasSet = this._keepConnectedToDiasSet()
          if (diasSet.has(peerInfo)) {
            this.discovery.emit('peer', peerInfo)
          }
        } else {
          // peer is not interested. maybe disconnect?
          this._ipfs._libp2pNode.hangUp(peerInfo, (err) => {
            if (err) {
              this.emit('error', err)
            }
          })
        }
      })
      .catch((err) => {
        debug('error caught while finding out if peer is interested in app', err)
      })
  }

  _isInterestedInApp (peerInfo) {
    if (Buffer.isBuffer(peerInfo) || Array.isArray(peerInfo)) {
      throw new Error('needs peer info!')
    }
    // TODO: refactor this, PLEASE!
    return new Promise((resolve, reject) => {
      const idB58Str = peerInfo.id.toB58String()

      debug('finding out whether peer %s is interested in app', idB58Str)

      if (!this._inboundConnections.has(peerInfo)) {
        this._outboundConnections.add(peerInfo)
      }

      this._ipfs._libp2pNode.dial(peerInfo, (err) => {
        if (err) {
          return reject(err)
        }

        // we're connected to the peer
        // let's wait until we know the peer subscriptions

        const appTopic = this._appTopic()
        const pollTimeout = 500 // TODO: this should go to config
        let tryUntil = Date.now() + 5000 // TODO: this should go to config

        const pollPeer = () => {
          this._ipfs.pubsub.peers(appTopic, (err, peers) => {
            if (err) {
              return reject(err)
            }
            if (peers.indexOf(idB58Str) >= 0) {
              resolve(true)
            } else {
              maybeSchedulePeerPoll()
            }
          })
        }

        const maybeSchedulePeerPoll = () => {
          if (Date.now() < tryUntil) {
            setTimeout(pollPeer, pollTimeout)
          } else {
            resolve(false)
          }
        }

        maybeSchedulePeerPoll()
      })
    })
  }

  _keepConnectedToDiasSet () {
    const diasSet = this._diasSet(this._ring)

    // make sure we're connected to every peer of the Dias Peer Set
    for (let peerInfo of diasSet.values()) {
      if (!this._outboundConnections.has(peerInfo)) {
        this._outboundConnections.add(peerInfo)
        this._ipfs._libp2pNode.dial(peerInfo, (err) => {
          if (err) {
            debug('error dialing:', err)
          }
        })
      }
    }

    // make sure we disconnect from peers not in the Dias Peer Set

    // TODO: keep inbound connections alive. we just want to redefine the outbound connections,
    // not the inbound ones.
    for (let peerInfo of this._outboundConnections.values()) {
      if (!diasSet.has(peerInfo)) {
        this._ipfs._libp2pNode.hangUp(peerInfo, (err) => {
          if (err) {
            this.emit('error', err)
          }
        })
      }
    }

    return diasSet
  }

  _appTopic () {
    return this._app.name
  }
}

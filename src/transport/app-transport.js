'use strict'

const debug = require('debug')('peer-star:app-transport')
const PeerInfo = require('peer-info')
const PeerId = require('peer-id')
const multiaddr = require('multiaddr')
const Ring = require('./ring')
const EventEmitter = require('events')
const Gossip = require('./gossip')
const DiasSet = require('./dias-peer-set')

const PEER_ID_BYTE_COUNT = 32

module.exports = (...args) => new AppTransport(...args)

class AppTransport extends EventEmitter {
  constructor (appName, ipfs, transport) {
    super()
    this._started = false
    this._ipfs = ipfs
    this._transport = transport
    this._appName = appName

    this._ring = Ring()
    this.listeners = []

    this._peerDiscovered = this._peerDiscovered.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)

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

    this._gossip = Gossip(appName, ipfs)
    this._gossip.on('error', (err) => this.emit('error', err))
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
  }

  _startPeerId () {
    if (this._ipfs._peerInfo) {
      this._diasSet = DiasSet(PEER_ID_BYTE_COUNT, this._getPeerId())
    } else {
      this._ipfs.once('ready', this._startPeerId.bind(this))
    }
  }

  _onPeerDisconnect (peerInfo) {
    debug('peer %s disconnected', peerInfo.id.toB58String())
    this._ring.remove(peerIdFromPeerInfo(peerInfo))
  }

  _peerDiscovered (peerInfo) {
    // TODO: refactor this, PLEASE!
    debug('peer discovered %j', peerInfo)

    this._isInterestedInApp(peerInfo)
      .then((isInterestedInApp) => {
        if (isInterestedInApp) {
          debug('peer %s is interested:', maStr)
          this._ring.add(peerIdFromPeerInfo(peerInfo))
          const peers = this._diasSet(this._ring)
          this.discovery.emit('peer', peerInfo)
        } else {
          // peer is not interested. maybe disconnect?
          const addresses = peerInfo.multiaddrs.toArray()
          if (addresses.length) {
            this.ipfs.swarm.disconnect(addresses[0], (err) => {
              if (err) {
                this.emit('error', err)
              }
            })
          }
        }
      })
      .catch((err) => {
        debug('error caught while finding out if peer is interested in app', err)
      })
  }

  _isInterestedInApp (peerInfo) {
    // TODO: refactor this, PLEASE!
    return new Promise((resolve, reject) => {
      const idB58Str = peerInfo.id.toB58String()
      debug('findig out whether peer %s is interested in app', idB58Str)
      console.log('peer info:', peerInfo)
      const addresses = peerInfo.multiaddrs.toArray()
      if (!addresses.length) {
        return reject(new Error('no addresses'))
      }
      this._ipfs.swarm.connect(addresses[0], (err) => {
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

  _getPeerId () {
    return peerIdFromPeerInfo(this._ipfs._peerInfo)
  }

  _appTopic () {
    return this._appName
  }
}

function peerIdFromPeerInfo (peerInfo) {
  // slice off the preamble so that we get a better distribution
  return peerInfo.id.toBytes().slice(2)
}

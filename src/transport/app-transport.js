'use strict'

const debug = require('debug')('peer-star:app-transport')
const PeerInfo = require('peer-info')
const PeerId = require('peer-id')
const multiaddr = require('multiaddr')
const EventEmitter = require('events')

module.exports = (...args) => new AppTransport(...args)

class AppTransport extends EventEmitter {
  constructor (appName, ipfs, transport) {
    super()
    this._ipfs = ipfs
    this._transport = transport
    this._appName = appName

    this.listeners = []

    this._peerDiscovered = this._peerDiscovered.bind(this)

    this.discovery = new EventEmitter()
    this.discovery.start = (callback) => {
      debug('starting discovery')
      this._transport.discovery.on('peer', this._peerDiscovered)
      return this._transport.discovery.start(callback)
    }
    this.discovery.stop = (callback) => {
      debug('stopping discovery')
      this._transport.discovery.removeListener('peer', this._peerDiscovered)
      return this._transport.discovery.stop(callback)
    }
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

  _peerDiscovered (maStr) {
    debug('peer discovered %s', maStr)
    const peerIdStr = maStr.split('/ipfs/').pop()
    const peerId = PeerId.createFromB58String(peerIdStr)
    const peerInfo = new PeerInfo(peerId)
    peerInfo.multiaddrs.add(multiaddr(maStr))

    this._isInterestedInApp(peerInfo)
      .then((isInterestedInApp) => {
        // TODO: put in on a hashring
        this.discovery.emit('peer', peerInfo)
      })
      .catch((err) => {
        debug('error caught while finding out if peer is interested in app', err)
      })
  }

  _isInterestedInApp (peerInfo) {
    return new Promise((resolve, reject) => {
      const pubsub = this._ipfs._libp2pNode.pubsub
      const idB58Str = peerInfo.id.toB58String()
      debug('findig out whether peer %s is interested in app', idB58Str)
      pubsub._dialPeer(peerInfo, (err) => {
        if (err) {
          return reject(err)
        }

        // we're connected to the peer
        // let's wait until we know the peer subscriptions

        const appTopic = this._appTopic()
        const pollTimeout = 500 // TODO: this should go to config
        let tryUntil = Date.now() + 5000 // TODO: this should go to config

        const pollPeer = () => {
          const pubsubPeer = pubsub.peers.get(idB58Str)
          if (!pubsubPeer) {
            return maybeSchedulePeerPoll()
          }
          if (pubsubPeer.topics.has(appTopic)) {
            resolve(true)
          } else {
            maybeSchedulePeerPoll()
          }
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

  _appTopic () {
    return this._appName
  }

}

function multiaddrMatches (ma) {
  const pnames = ma.protoNames()
  return pnames.length === 1 && pnames[0] === 'peer-star-websocket-star'
}

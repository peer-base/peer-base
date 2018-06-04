'use strict'

const debug = require('debug')('peer-star:app')
const PeerInfo = require('peer-info')
const multiaddr = require('multiaddr')
const EventEmitter = require('events')

module.exports = (...args) => new AppTransport(...args)

class AppTransport {
  constructor (appName, transport) {
    this._transport = transport
    this._appName = appName

    this._peerDiscovered = this._peerDiscovered.bind(this)

    this.discovery = new EventEmitter()
    this.discovery.start = (callback) => {
      this._transport.discovery.on('peer', this._peerDiscovered)
      return this._transport.discovery.start(callback)
    }
    this.discovery.stop = (callback) => {
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
    console.log('Peer Discovered:', maStr)
    const peerIdStr = maStr.split('/ipfs/').pop()
    const peerId = PeerId.createFromB58String(peerIdStr)
    const peerInfo = new PeerInfo(peerId)

    peerInfo.multiaddrs.add(multiaddr(maStr))
    this.discovery.emit('peer', peerInfo)
  }
}

function multiaddrMatches (ma) {
  const pnames = ma.protoNames()
  return pnames.length === 1 && pnames[0] === 'peer-star-websocket-star'
}

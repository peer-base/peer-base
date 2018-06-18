'use strict'

const debug = require('debug')('peer-star:global-connection-manager')
const pull = require('pull-stream')
const through = require('pull-through')
const PeerSet = require('../common/peer-set')

module.exports = class GlobalConnectionManager {
  constructor (ipfs, appTransport) {
    this._ipfs = ipfs
    this._appTransport = appTransport

    this._peerCollaborations = new Map()
    this._outbound = new PeerSet()
    this._inbound = new PeerSet()

    this._onPeerConnect = this._onPeerConnect.bind(this)
    this._onPeerDisconnect = this._onPeerDisconnect.bind(this)
  }

  start () {
    this._ipfs._libp2pNode.on('peer:connect', this._onPeerConnect)
    this._ipfs._libp2pNode.on('peer:disconnect', this._onPeerDisconnect)
  }

  stop () {
    this._ipfs._libp2pNode.removeListener('peer:connect', this._onPeerConnect)
    this._ipfs._libp2pNode.removeListener('peer:disconnect', this._onPeerDisconnect)

    // TODO: disconnect all
  }

  connect (peerInfo, protocol) {
    return new Promise((resolve, reject) => {
      this._outbound.add(peerInfo)
      const peerId = peerInfo.id.toB58String()
      if (!this._peerCollaborations.has(peerId)) {
        this._peerCollaborations.set(peerId, new Set([protocol]))
      } else {
        this._peerCollaborations.get(peerId).add(protocol)
      }

      this._ipfs._libp2pNode.dialProtocol(peerInfo, protocol, (err, conn) => {
        if (err) {
          return reject(err)
        }
        // TODO: catch close and maybe GC peer conn

        resolve(
          pull(
            conn,
            passthrough((err) => {
              this._peerCollaborations.get(peerId).delete(protocol)
              this.maybeHangUp(peerInfo)
            })))
      })
    })
  }

  disconnect (peerInfo, protocol) {
    // TODO
    const peerId = peerInfo.id.toB58String()
    this._peerCollaborations.get(peerId).delete(protocol)
    // TODO: maybe GC peer conn
    this.maybeHangUp(peerInfo)
  }

  handle (protocol, handler) {
    return this._ipfs._libp2pNode.handle(protocol, handler)
  }

  unhandle (protocol) {
    return this._ipfs._libp2pNode.unhandle(protocol)
  }

  _onPeerConnect (peerInfo) {
    if (!this._outbound.has(peerInfo) && !this._appTransport.isOutbound(peerInfo)) {
      this._inbound.add(peerInfo)
    }
  }

  _onPeerDisconnect (peerInfo) {
    this._outbound.delete(peerInfo)
    this._inbound.delete(peerInfo)
    const peerId = peerInfo.id.toB58String()
    this._peerCollaborations.delete(peerId)
  }

  maybeHangUp (peerInfo) {
    if (this._inbound.has(peerInfo) || this._appTransport.isOutbound(peerInfo)) {
      // either there's an inbound connection
      // or we are using at the app layer.
      // Either way let's not close it
      return
    }

    const dialedProtocols = this._peerCollaborations.get(peerInfo)
    const canClose = !dialedProtocols || !dialedProtocols.size
    if (canClose) {
      debug('hanging up %s', peerInfo.id.toB58String())
      this._ipfs._libp2pNode.hangUp(peerInfo, (err) => {
        if (err) {
          console.error('error hanging up:', err.message)
          debug('error hanging up:', err)
        }
      })
    }
  }
}

function passthrough (onEnd) {
  return through(
    function(d) {
      this.queue(d)
    },
    onEnd)
}
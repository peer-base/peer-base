/* eslint no-console: "off", no-warning-comments: "off" */
'use strict'

const debug = require('debug')('peer-base:global-connection-manager')
const pull = require('pull-stream')
const EventEmitter = require('events')
const PeerSet = require('../common/peer-set')
const expectedNetworkError = require('../common/expected-network-error')

module.exports = class GlobalConnectionManager extends EventEmitter {
  constructor (ipfs, appTransport) {
    super()
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
      debug('connect', peerId, protocol)
      if (!this._peerCollaborations.has(peerId)) {
        this._peerCollaborations.set(peerId, new Set([protocol]))
      } else {
        this._peerCollaborations.get(peerId).add(protocol)
      }

      this._ipfs._libp2pNode.dialProtocol(peerInfo, protocol, (err, conn) => {
        if (err) {
          return reject(err)
        }

        if (!conn) {
          return reject(new Error('could not connect'))
        }

        this.emit('connected', peerInfo)

        const retConn = Object.assign(new EventEmitter(), {
          sink: conn.sink,
          source: pull(
            conn.source,
            pull.through(null, (err) => {
              this.emit('disconnected', peerInfo)
              if (err && !expectedNetworkError(err)) {
                console.error('connection to %s ended with error', peerId, err.message)
                debug('connection to %s ended with error', peerId, err)
              }
              const peerCollaborations = this._peerCollaborations.get(peerId)
              peerCollaborations && peerCollaborations.delete(protocol)
              this.maybeHangUp(peerInfo)
              retConn.emit('closed', err)
            })
          )
        })

        resolve(retConn)
      })
    })
  }

  disconnect (peerInfo, protocol) {
    // TODO
    const peerId = peerInfo.id.toB58String()
    const collaborations = this._peerCollaborations.get(peerId)
    if (collaborations) {
      collaborations.delete(protocol)
    }

    // TODO: maybe GC peer conn
    return this.maybeHangUp(peerInfo)
  }

  handle (protocol, handler) {
    return new Promise((resolve, reject) => {
      if (!this._ipfs._libp2pNode) {
        this._ipfs.once('ready', () => {
          this._ipfs._libp2pNode.handle(protocol, handler)
          resolve()
        })
        return
      }
      this._ipfs._libp2pNode.handle(protocol, handler)
      resolve()
    })
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
    return new Promise((resolve) => {
      if (this._inbound.has(peerInfo) || this._appTransport.isOutbound(peerInfo)) {
        // either there's an inbound connection
        // or we are using at the app layer.
        // Either way let's not close it
        return resolve()
      }

      const peerId = peerInfo.id.toB58String()
      const dialedProtocols = this._peerCollaborations.get(peerId)
      const canClose = !dialedProtocols || !dialedProtocols.size
      if (canClose) {
        debug('hanging up %s', peerInfo.id.toB58String())
        try {
          this._ipfs._libp2pNode.hangUp(peerInfo, (err) => {
            if (err) {
              console.error('error hanging up:', err.message)
              debug('error hanging up:', err)
            }
            resolve()
          })
        } catch (err) {
          if (err.message !== 'The libp2p node is not started yet') {
            console.error('error hanging up:', err.message)
          }
          debug('error hanging up:', err)
          resolve()
        }
      } else {
        resolve()
      }
    })
  }
}

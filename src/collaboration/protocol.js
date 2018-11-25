/* eslint no-console: "off" */
'use strict'

const debug = require('debug')('peer-star:collaboration:protocol')
const EventEmitter = require('events')
const pull = require('pull-stream')

const PushProtocol = require('./push-protocol')
const PullProtocol = require('./pull-protocol')

const defaultOptions = {
  receiveTimeoutMS: 3000
}

module.exports = (...args) => {
  return new Protocol(...args)
}

class Protocol extends EventEmitter {
  constructor (ipfs, collaboration, store, keys, clocks, replication, options) {
    super()
    this._ipfs = ipfs
    this._collaboration = collaboration
    this._store = store
    this._clocks = clocks
    this._options = Object.assign({}, defaultOptions, options)
    this._pushProtocol = new PushProtocol(ipfs, store, this._clocks, keys, replication, this._options)
    this._pullProtocol = new PullProtocol(ipfs, store, this._clocks, keys, replication, this._options)

    this.handler = this.handler.bind(this)
  }

  name () {
    return `/peer-*/collab/${this._collaboration.name}`
  }

  handler (protocol, conn) {
    conn.getPeerInfo((err, peerInfo) => {
      if (err) {
        console.error('%s: error getting peer info:', this._peerId(), err.message)
        debug('%s: error getting peer info:', this._peerId(), this.err)
        return this.emit('error', err)
      }

      this.emit('inbound connection', peerInfo)

      const peerId = peerInfo.id.toB58String()

      pull(
        conn,
        this.observeInbound(peerId),
        this._pullProtocol.forPeer(peerInfo),
        this.observeOutbound(peerId),
        passthrough((err) => {
          if (err && err.message !== 'underlying socket has been closed') {
            console.error(`connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
            debug(`${this._peerId()}: connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
          }
          this.emit('inbound connection closed', peerInfo)
        }),
        conn
      )
    })
  }

  dialerFor (peerInfo, conn) {
    this.emit('outbound connection', peerInfo)
    const peerId = peerInfo.id.toB58String()

    pull(
      conn,
      this.observeInbound(peerId),
      this._pushProtocol.forPeer(peerInfo),
      this.observeOutbound(peerId),
      passthrough((err) => {
        if (err && err.message !== 'underlying socket has been closed') {
          console.error(`connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
          debug(`${this._peerId()}: connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
        }
        this.emit('outbound connection closed', peerInfo)
      }),
      conn
    )
  }

  vectorClock (_peerId) {
    const peerId = _peerId || this._ipfs._peerInfo.id.toB58String()
    return this._clocks.getFor(peerId)
  }

  observeInbound (peerId) {
    return pull.map((d) => {
      this.emit('inbound message', { fromPeer: peerId, size: d.length })
      return d
    })
  }

  observeOutbound (peerId) {
    return pull.map((d) => {
      this.emit('outbound message', { toPeer: peerId, size: d.length })
      return d
    })
  }

  _peerId () {
    if (!this._cachedPeerId) {
      this._cachedPeerId = this._ipfs._peerInfo.id.toB58String()
    }
    return this._cachedPeerId
  }
}

function passthrough (_onEnd) {
  const onEnd = (err) => {
    try {
      _onEnd(err)
    } catch (err2) {
      if (err2) {
        console.error('error in onEnd handler:', err2)
      }
    }
  }
  return pull.through(
    null,
    onEnd)
}

'use strict'

const debug = require('debug')('peer-star:collaboration:protocol')
const EventEmitter = require('events')
const pull = require('pull-stream')

const Clocks = require('./clocks')
const PushProtocol = require('./push-protocol')
const PullProtocol = require('./pull-protocol')

const defaultOptions = {
  receiveTimeout: 3000
}

module.exports = (...args) => {
  return new Protocol(...args)
}

class Protocol extends EventEmitter {
  constructor (ipfs, collaboration, store, keys, options) {
    super()
    this._ipfs = ipfs
    this._collaboration = collaboration
    this._store = store
    this._options = Object.assign({}, defaultOptions, options)
    this._streamsFor = new Map()
    this._clocks = new Clocks(this._ipfs._peerInfo.id.toB58String())
    this._pushProtocol = new PushProtocol(ipfs, store, this._clocks, keys, this._options)
    this._pullProtocol = new PullProtocol(ipfs, store, this._clocks, keys, this._options)

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

      this._incrementStreamsFor(peerInfo)

      this.emit('inbound connection', peerInfo)

      pull(
        conn,
        this._pullProtocol.forPeer(peerInfo),
        passthrough((err) => {
          this._decrementStreamsFor(peerInfo)
          if (err) {
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

    this._incrementStreamsFor(peerInfo)

    pull(
      conn,
      this._pushProtocol.forPeer(peerInfo),
      passthrough((err) => {
        this._decrementStreamsFor(peerInfo)
        if (err) {
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

  _peerId () {
    if (!this._cachedPeerId) {
      this._cachedPeerId = this._ipfs._peerInfo.id.toB58String()
    }
    return this._cachedPeerId
  }

  _incrementStreamsFor (peerInfo) {
    const peerId = peerInfo.id.toB58String()
    this._streamsFor.set(peerId, (this._streamsFor.get(peerId) || 0) + 1)
  }

  _decrementStreamsFor (peerInfo) {
    const peerId = peerInfo.id.toB58String()
    let count = this._streamsFor.get(peerId) || 0
    count = Math.max(count - 1, 0)
    if (!count) {
      this._clocks.takeDown(peerId)
    }
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

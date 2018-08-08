'use strict'

const debug = require('debug')('peer-star:collaboration:stats:protocol')
const pull = require('pull-stream')
const PushProtocol = require('./push-protocol')
const PullProtocol = require('./pull-protocol')

class StatsProtocol {
  constructor (ipfs, collaboration, stats) {
    this._collaboration = collaboration
    this._pushProtocol = new PushProtocol(ipfs, stats)
    this._pullProtocol = new PullProtocol(ipfs, stats)
  }

  name () {
    return `/peer-*/collab/${this._collaboration.name}/stats`
  }

  handler (protocol, conn) {
    conn.getPeerInfo((err, peerInfo) => {
      if (err) {
        console.error('%s: error getting peer info:', this._peerId(), err.message)
        debug('%s: error getting peer info:', this._peerId(), this.err)
        return this.emit('error', err)
      }

      pull(
        conn,
        this._pushProtocol.forPeer(peerInfo),
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

    pull(
      conn,
      this._pullProtocol.forPeer(peerInfo),
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

module.exports = StatsProtocol

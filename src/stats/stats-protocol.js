/* eslint no-console: "off" */
'use strict'

const debug = require('debug')('peer-star:collaboration:stats:protocol')
const pull = require('pull-stream')
const EventEmitter = require('events')
const PushProtocol = require('./push-protocol')
const PullProtocol = require('./pull-protocol')

class StatsProtocol extends EventEmitter {
  constructor (ipfs, collaboration, stats) {
    super()
    this._collaboration = collaboration
    this._pushProtocol = new PushProtocol(ipfs, stats)
    this._pullProtocol = new PullProtocol(ipfs, stats)
    this._pullerCount = 0
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

      this.emit('puller count changed', ++this._pullerCount)
      pull(
        conn,
        this._pushProtocol.forPeer(peerInfo),
        passthrough(() => {
          this.emit('puller count changed', --this._pullerCount)
        }),
        conn
      )
    })
  }

  dialerFor (peerInfo, conn) {
    pull(
      conn,
      this._pullProtocol.forPeer(peerInfo),
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

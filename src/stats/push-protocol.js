'use strict'

const debug = require('debug')('peer-star:collaboration:stats:pull-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const handlingData = require('../common/handling-data')
const encode = require('delta-crdts-msgpack-codec').encode
const expectedNetworkError = require('../common/expected-network-error')

class StatsPushProtocol {
  constructor (ipfs, stats) {
    this._ipfs = ipfs
    this._stats = stats
  }

  forPeer (peerInfo) {
    const remotePeerId = peerInfo.id.toB58String()
    debug('%s: push protocol to %s', this._peerId(), remotePeerId)
    const wantPeers = new Set()
    let ended = false

    const onSelfStats = (stats) => {
      output.push(encode([this._peerId(), stats]))
    }

    this._stats.on(this._peerId(), onSelfStats)

    const onPeerStats = (peerId, stats) => {
      if (wantPeers.has(peerId)) {
        output.push(encode([peerId, stats]))
      }
    }

    this._stats.on('peer updated', onPeerStats)

    const onNewData = (data) => {
      let [adds, removes] = data
      if (removes) {
        for (let peerId of removes) {
          wantPeers.delete(peerId)
        }
      }

      if (adds) {
        for (let peerId of adds) {
          wantPeers.add(peerId)
        }
      }
    }

    const onData = (err, data) => {
      if (err) {
        onEnd(err)
        return
      }

      onNewData(data)
    }

    const onEnd = (err) => {
      if (!ended) {
        if (err && expectedNetworkError(err)) {
          debug('%s: conn to %s ended with error', this._peerId(), remotePeerId, err)
          err = null
        }
        this._stats.removeListener(this._peerId(), onSelfStats)
        this._stats.removeListener('peer updated', onPeerStats)
        ended = true
        output.end(err)
      }
    }
    const input = pull.drain(handlingData(onData), onEnd)
    const output = pushable()

    return { sink: input, source: output }
  }

  _peerId () {
    if (!this._cachedPeerId) {
      this._cachedPeerId = this._ipfs._peerInfo.id.toB58String()
    }
    return this._cachedPeerId
  }
}

module.exports = StatsPushProtocol

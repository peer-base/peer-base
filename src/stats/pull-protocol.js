'use strict'

const debug = require('debug')('peer-star:collaboration:stats:pull-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const handlingData = require('../common/handling-data')
const encode = require('delta-crdts-msgpack-codec').encode

class StatsPullProtocol {
  constructor (ipfs, stats) {
    this._ipfs = ipfs
    this._stats = stats
  }

  forPeer (peerInfo) {
    const remotePeerId = peerInfo.id.toB58String()
    debug('%s: pull protocol to %s', this._peerId(), remotePeerId)
    let ended = false
    let myWantedPeers = new Set()

    const onNeedStats = (peerId) => {
      // say that we need peer id
      myWantedPeers.add(peerId)
      output.push(encode([[peerId]]))
    }

    this._stats.on('need', onNeedStats)

    const onPeerUpdatedStats = (peerId, stats, sourcePeerId) => {
      if (sourcePeerId !== remotePeerId && myWantedPeers.has(peerId)) {
        // we just got stats for this peer, so let's say we don't need updates for it
        myWantedPeers.delete(peerId)
        output.push(encode([null, [peerId]]))
      }
    }

    this._stats.on('peer updated', onPeerUpdatedStats)

    const onNewData = (data) => {
      const [peerId, stats] = data
      this._stats.setFor(peerId, stats, remotePeerId)
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
        if (err && err.message !== 'underlying socket has been closed') {
          debug('%s: conn to %s ended with error', this._peerId(), remotePeerId, err)
        }
        ended = true
        output.end(err)
        this._stats.removeListener('need', onNeedStats)
        this._stats.removeListener('peer updated', onPeerUpdatedStats)
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

module.exports = StatsPullProtocol

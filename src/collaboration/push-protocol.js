'use strict'

const debug = require('debug')('peer-star:collaboration:push-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const vectorclock = require('vectorclock')
const handlingData = require('../common/handling-data')
const encode = require('../common/encode')

module.exports = class PushProtocol {
  constructor (ipfs, store, options) {
    this._ipfs = ipfs
    this._store = store
    this._options = options
  }

  forPeer (peerInfo) {
    debug('%s: push protocol to %s', this._peerId(), peerInfo.id.toB58String())
    let ended = false
    let pushing = true
    let remoteClock = null
    let localClock = null
    let pushedClock = null

    const remoteNeedsUpdate = () => {
      if (pushing) {
        this._store.getClockAndState()
          .then(([clock, state]) => {
            pushedClock = clock
            output.push(encode([clock, state]))
          })
          .catch(onEnd)
      } else {
        this._store.getLatestClock()
          .then((clock) => {
            // on lazy mode, only send clock
            output.push(encode([clock]))
          })
          .catch(onEnd)
      }
    }

    const reduceEntropy = (newClock) => {
      if (!newClock) {
        this._store.getLatestClock().then(reduceEntropy).catch(onEnd)
        return
      }
      localClock = newClock

      debug('%s: comparing local clock %j to remote clock %j', this._peerId(), newClock, remoteClock)
      if (localClock &&
          (!remoteClock || !pushedClock ||
            (vectorclock.compare(newClock, remoteClock) >= 0 &&
            !vectorclock.isIdentical(newClock, remoteClock) &&
            !vectorclock.isIdentical(newClock, pushedClock)))) {
        remoteNeedsUpdate()
      }
    }

    this._store.on('clock changed', reduceEntropy)
    debug('%s: registered state change handler', this._peerId())

    const gotPresentation = (message) => {
      debug('%s: got presentation message from %s:', this._peerId(), peerInfo.id.toB58String(), message)
      const [newRemoteClock, startLazy, startEager] = message

      if (startLazy) {
        debug('%s: push connection to %s now in lazy mode', this._peerId(), peerInfo.id.toB58String())
        pushing = false
      }

      if (startEager) {
        debug('%s: push connection to %s now in eager mode', this._peerId(), peerInfo.id.toB58String())
        pushing = true
      }

      if (newRemoteClock) {
        remoteClock = vectorclock.merge(remoteClock || {}, newRemoteClock)
      }
      if (newRemoteClock || startEager) {
        reduceEntropy(localClock)
      }
    }

    let messageHandler = gotPresentation

    const onMessage = (err, message) => {
      if (err) {
        console.error('error parsing message:', err.message)
        debug('error parsing message:', err)
        onEnd(err)
      } else {
        debug('%s: got message:', this._peerId(), message)
        try {
          messageHandler(message)
        } catch (err) {
          onEnd(err)
        }
      }
    }

    const onEnd = (err) => {
      if (!ended) {
        if (err) {
          console.error(err.message)
          debug(err)
        }
        ended = true
        this._store.removeListener('clock changed', reduceEntropy)
        output.end(err)
      }
    }
    const input = pull.drain(handlingData(onMessage), onEnd)
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

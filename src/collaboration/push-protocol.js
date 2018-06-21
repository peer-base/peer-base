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
    let vc = null
    let pushedVC = {}

    const onNewState = (newState) => {
      debug('%s: new state', this._peerId(), newState)
      if (!ended && vc) {
        const [newVC, state] = newState
        debug('%s: comparing local VC %j to remote VC %j', this._peerId(), newVC, vc)
        if (vectorclock.compare(newVC, vc) >= 0 &&
            !vectorclock.isIdentical(newVC, vc) &&
            !vectorclock.isIdentical(newVC, pushedVC)) {
          debug('%s: going to send to %s data for clock %j', this._peerId(), peerInfo.id.toB58String(), newVC)
          if (pushing) {
            pushedVC = vectorclock.merge(pushedVC, newVC)
            output.push(encode([newVC, state]))
          } else {
            output.push(encode([newVC]))
          }
        }
      }
    }

    this._store.on('state changed', onNewState)
    debug('%s: registered state change handler', this._peerId())

    const gotPresentation = (message) => {
      debug('%s: got presentation message from %s:', this._peerId(), peerInfo.id.toB58String(), message)
      const [remoteClock, startLazy, startEager] = message

      if (startLazy) {
        debug('%s: push connection to %s now in lazy mode', this._peerId(), peerInfo.id.toB58String())
        pushing = false
      }

      if (startEager) {
        debug('%s: push connection to %s now in eager mode', this._peerId(), peerInfo.id.toB58String())
        pushing = true
      }

      if (remoteClock || startEager) {
        if (remoteClock) {
          vc = vectorclock.merge(vc || {}, remoteClock)
        }
        this._store.getClockAndState()
          .then(onNewState)
          .catch((err) => {
            console.error('%s: error getting latest clock and state: ', this._peerId(), err.message)
            debug('%s: error getting latest clock and state: ', this._peerId(), err)
          })
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
          console.error('error handling message:', err)
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
        this._store.removeListener('state changed', onNewState)
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

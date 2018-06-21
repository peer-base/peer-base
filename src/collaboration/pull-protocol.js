'use strict'

const debug = require('debug')('peer-star:collaboration:pull-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const vectorclock = require('vectorclock')
const Queue = require('p-queue')
const handlingData = require('../common/handling-data')
const encode = require('../common/encode')

module.exports = class PullProtocol {
  constructor (ipfs, store) {
    this._ipfs = ipfs
    this._store = store
  }

  forPeer (peerInfo) {
    debug('%s: pull protocol to %s', this._peerId(), peerInfo.id.toB58String())
    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let waitingForClock = null
    let timeout

    const onNewState = ([clock]) => {
      debug('%s got new clock from state:', this._peerId(), clock)
      output.push(encode([clock]))
    }
    this._store.on('state changed', onNewState)

    const onData = (err, data) => {
      if (err) {
        debug('%s: error in parsing remote data:', this._peerId(), err.message)
        debug('%s: error in parsing remote data:', this._peerId(), err)
        return
      }

      debug('%s got new data from %s :', this._peerId(), peerInfo.id.toB58String(), data.toString())

      queue.add(async () => {
        const [clock, state] = data
        if (clock) {
          if (state) {
            console.log('waitingForClock:', waitingForClock)
            if (waitingForClock &&
                (vectorclock.isIdentical(waitingForClock, clock) ||
                vectorclock.compare(waitingForClock, clock) < 0)) {
              waitingForClock = null
              if (timeout) {
                clearTimeout(timeout)
              }
            }
            if (await this._store.contains(clock)) {
              // we already have this state
              // send a "prune" message
              output.push(encode([null, true]))
            } else {
              await this._store.saveState([clock, state])
            }
          } else {
            // Only got the vector clock, which means that this connection
            //   is on lazy mode.
            // We must wait a bit to see if we get the data this peer has
            //   from any other peer.
            // If not, we should engage eager mode
            waitingForClock = vectorclock.merge(waitingForClock || {}, clock)
            if (timeout) {
              clearTimeout(timeout)
            }
            timeout = setTimeout(() => {
              timeout = null
              // are we still waiting for this clock?
              if (vectorclock.isIdentical(waitingForClock, clock) ||
                  vectorclock.compare(waitingForClock, clock) < 0) {
                output.push(encode([null, false, true]))
              }
            }, this._options.receiveTimeout)
            // timeout and maybe turn into eager mode?
          }
        }
      })

      return true // keep the stream alive
    }

    const onEnd = (err) => {
      if (!ended) {
        if (err) {
          console.error('%s: pull conn to %s ended with error', this._peerId(), peerInfo.id.toB58String(), err.message)
          debug('%s: conn to %s ended with error', this._peerId(), peerInfo.id.toB58String(), err)
        }
        ended = true
        this._store.removeListener('state changed', onNewState)
        output.end(err)
      }
    }
    const input = pull.drain(handlingData(onData), onEnd)
    const output = pushable()

    this._store.getLatestClock()
      .then((vectorClock) => {
        debug('%s: sending latest vector clock to %s:', this._peerId(), peerInfo.id.toB58String(), vectorClock)
        output.push(encode([vectorClock]))
      })
      .catch(onEnd)

    return { sink: input, source: output }
  }

  _peerId () {
    if (!this._cachedPeerId) {
      this._cachedPeerId = this._ipfs._peerInfo.id.toB58String()
    }
    return this._cachedPeerId
  }
}

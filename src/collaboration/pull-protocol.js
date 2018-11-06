'use strict'

const debug = require('debug')('peer-star:collaboration:pull-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const Queue = require('p-queue')
const handlingData = require('../common/handling-data')
const encode = require('delta-crdts-msgpack-codec').encode
const vectorclock = require('../common/vectorclock')

module.exports = class PullProtocol {
  constructor (ipfs, store, clocks, keys, options) {
    this._ipfs = ipfs
    this._store = store
    this._clocks = clocks
    this._keys = keys
    this._options = options
  }

  forPeer (peerInfo) {
    const remotePeerId = peerInfo.id.toB58String()
    debug('%s: pull protocol to %s', this._peerId(), remotePeerId)
    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let waitingForClock = null
    let timeout

    const onNewLocalClock = (clock) => {
      debug('%s got new clock from state:', this._peerId(), clock)
      // TODO: only send difference from previous clock
      this._clocks.setFor(this._peerId(), clock)
      output.push(encode([clock]))
    }
    this._store.on('clock changed', onNewLocalClock)

    const onNewData = (data) => {
      debug('%s got new data from %s :', this._peerId(), remotePeerId, data)

      queue.add(async () => {
        const [deltaRecord, newState] = data
        let clock
        let states
        let delta
        if (deltaRecord) {
          const [previousClock, authorClock] = deltaRecord
          delta = deltaRecord[2]
          clock = vectorclock.incrementAll(previousClock, authorClock)
        } else if (newState) {
          clock = newState[0]
          states = newState[1]
        }

        if (clock) {
          this._clocks.setFor(remotePeerId, clock)
          if (states || delta) {
            if (waitingForClock &&
                (vectorclock.isIdentical(waitingForClock, clock) ||
                 vectorclock.compare(waitingForClock, clock) < 0)) {
              // We received what we were waiting for, so we can clear the timeout
              waitingForClock = null
              if (timeout) {
                clearTimeout(timeout)
              }
            }
            debug('%s: received clock from %s: %j', this._peerId(), remotePeerId, clock)
            if (await this._store.contains(clock)) {
              // we already have this state
              // send a "prune" messagere
              debug('%s: store contains clock', this._peerId(), clock)
              debug('%s: setting %s to lazy mode (1)', this._peerId(), remotePeerId)
              output.push(encode([null, true]))
            } else {
              debug('%s: store does not contain clock', this._peerId(), clock)
              let saved
              if (states) {
                debug('%s: saving states', this._peerId(), states)
                saved = await this._store.saveStates([clock, states])
              } else if (delta) {
                debug('%s: saving delta', this._peerId(), deltaRecord)
                saved = await this._store.saveDelta(deltaRecord)
              }
              if (!saved) {
                debug('%s: did not save', this._peerId())
                debug('%s: setting %s to lazy mode (2)', this._peerId(), remotePeerId)
                output.push(encode([null, true]))
              } else {
                debug('%s: saved with new clock %j', this._peerId(), saved)
                output.push(encode([clock]))
              }
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
              timeout = null
            }
            timeout = setTimeout(() => {
              timeout = null
              // are we still waiting for this clock?
              if (waitingForClock &&
                  (vectorclock.isIdentical(waitingForClock, clock) ||
                  vectorclock.compare(waitingForClock, clock) < 0)) {
                debug('%s: timeout happened for clock', this._peerId(), waitingForClock)
                output.push(encode([null, false, true]))
              }
            }, this._options.receiveTimeoutMS)
            // timeout and maybe turn into eager mode?
          }
        }
      }).catch(onEnd)

      return true // keep the stream alive
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
          console.error('%s: pull conn to %s ended with error', this._peerId(), remotePeerId, err.stack)
          console.error('%s: pull conn to %s ended with error', this._peerId(), remotePeerId, err.message)
          debug('%s: conn to %s ended with error', this._peerId(), remotePeerId, err)
        }
        ended = true
        this._store.removeListener('clock changed', onNewLocalClock)
        output.end(err)
      }
    }
    const input = pull.drain(handlingData(onData), onEnd)
    const output = pushable()

    this._store.getLatestClock()
      .then((vectorClock) => {
        debug('%s: sending latest vector clock to %s:', this._peerId(), remotePeerId, vectorClock)
        output.push(encode([vectorClock, null, null, this._options.replicateOnly]))
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

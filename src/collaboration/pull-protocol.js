'use strict'

const debug = require('debug')('peer-star:collaboration:pull-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const Queue = require('p-queue')
const handlingData = require('../common/handling-data')
const { encode, decode } = require('delta-crdts-msgpack-codec')
const vectorclock = require('../common/vectorclock')

module.exports = class PullProtocol {
  constructor (ipfs, shared, clocks, keys, replication, options) {
    this._ipfs = ipfs
    this._shared = shared
    this._clocks = clocks
    this._keys = keys
    this._replication = replication
    this._options = options
  }

  forPeer (peerInfo) {
    const remotePeerId = peerInfo.id.toB58String()
    debug('%s: pull protocol to %s', this._peerId(), remotePeerId)
    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let sentClock = {}
    let waitingForClock = null
    let timeout

    const sendClockDiff = (clock) => {
      return clock
      const clockDiff = vectorclock.diff(sentClock, clock)
      sentClock = clock
      return clockDiff
    }

    const onNewLocalClock = (clock) => {
      debug('%s got new clock from state:', this._peerId(), clock)
      // TODO: only send difference from previous clock
      this._clocks.setFor(this._peerId(), clock)
      output.push(encode([sendClockDiff(clock)]))
    }
    this._shared.on('clock changed', onNewLocalClock)

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
          clock = vectorclock.sumAll(previousClock, authorClock)
        } else if (newState) {
          clock = newState[0]
          states = newState[1]
        }

        if (clock) {
          clock = this._clocks.setFor(remotePeerId, clock)
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

            let saved
            if (states) {
              debug('%s: saving states', this._peerId(), states)
              throw new Error('IMPLEMENT!')
              // saved = await this._shared.apply(clock, states)
            } else if (delta) {
              debug('%s: saving delta', this._peerId(), deltaRecord)
              saved = this._shared.apply(await this._decryptAndVerifyDelta(deltaRecord), true)
            }
            if (!saved) {
              debug('%s: did not save', this._peerId())
              debug('%s: setting %s to lazy mode (2)', this._peerId(), remotePeerId)
              output.push(encode([null, true]))
            } else {
              this._replication.received(remotePeerId, clock)
              debug('%s: saved with new clock %j', this._peerId(), saved)
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
        this._shared.removeListener('clock changed', onNewLocalClock)
        output.end(err)
      }
    }
    const input = pull.drain(handlingData(onData), onEnd)
    const output = pushable()

    const vectorClock = this._shared.clock()
    sentClock = vectorClock
    output.push(encode([vectorClock, null, null, this._options.replicateOnly || false]))

    return { sink: input, source: output }
  }

  _peerId () {
    if (!this._cachedPeerId) {
      this._cachedPeerId = this._ipfs._peerInfo.id.toB58String()
    }
    return this._cachedPeerId
  }

  async _decryptAndVerifyDelta (deltaRecord) {
    const [previousClock, authorClock, [forName, typeName, encryptedDelta]] = deltaRecord
    const decrytedDelta = decode(await this._decryptAndVerify(encryptedDelta))
    return [previousClock, authorClock, [forName, typeName, decrytedDelta]]
  }

  _decryptAndVerify (encrypted) {
    const { keys } = this._options
    return new Promise((resolve, reject) => {
      if (!keys.cipher && !keys.read) {
        return resolve(encrypted)
      }
      keys.cipher()
        .then((cipher) => cipher.decrypt(encrypted, (err, decrypted) => {
          if (err) {
            return reject(err)
          }
          const decoded = decode(decrypted)
          const [encoded, signature] = decoded

          keys.read.verify(encoded, signature, (err, valid) => {
            if (err) {
              return reject(err)
            }

            if (!valid) {
              return reject(new Error('delta has invalid signature'))
            }

            resolve(encoded)
          })
        }))
        .catch(reject)
    })
  }
}

'use strict'

const debug = require('debug')('peer-star:collaboration:push-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const debounce = require('lodash/debounce')
const Queue = require('p-queue')
const handlingData = require('../common/handling-data')
const encode = require('delta-crdts-msgpack-codec').encode
const vectorclock = require('../common/vectorclock')

// const RGA = require('delta-crdts').type('rga')
// const chai = require('chai')
// chai.use(require('dirty-chai'))
// const expect = chai.expect

module.exports = class PushProtocol {
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
    debug('%s: push protocol to %s', this._peerId(), remotePeerId)
    console.log('%s: push protocol to %s', this._peerId(), remotePeerId)

    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let pushing = true
    let isPinner = false
    let sentClock = {}
    let remoteClock = {}

    const sendClockDiff = (clock) => {
      return clock
      const clockDiff = vectorclock.diff(sentClock, clock)
      sentClock = clock
      return clockDiff
    }

    // const pushDeltaBatch = async (peerClock) => {
    //   const batch = this._shared.deltaBatch(peerClock)
    //   let [clock, authorClock, [, , batchState]] = batch
    //   const batchClock = vectorclock.sumAll(clock, authorClock)
    //   output.push(encode([await this._signAndEncryptDelta(batch)]))
    //   return vectorclock.merge(peerClock, batchClock)
    // }

    const pushDeltas = async (peerClock) => {
      const ds = this._shared.deltas(peerClock)
      let newRemoteClock = {}
      for (let d of ds) {
        const [clock, authorClock] = d
        newRemoteClock = vectorclock.merge(newRemoteClock, vectorclock.sumAll(clock, authorClock))
        output.push(encode([await this._signAndEncryptDelta(d)]))
      }

      return vectorclock.merge(peerClock, newRemoteClock)
    }

    const pushState = async () => {
      const state = this._shared.stateAsDelta()
      const [clock, authorClock] = state
      output.push(encode([await this._signAndEncryptDelta(state)]))
      return vectorclock.sumAll(clock, authorClock)
    }

    const updateRemote = async (myClock) => {
      debug('%s: updateRemote %s', this._peerId(), remotePeerId)
      if (pushing) {
        debug('%s: pushing to %s', this._peerId(), remotePeerId)
        // Let's try to see if we have deltas to deliver
        if (!isPinner) {
          remoteClock = await pushDeltas(remoteClock)
          // remoteClock = await pushDeltaBatch(remoteClock)
        }

        if (isPinner || remoteNeedsUpdate(myClock)) {
          if (pushing) {
            debug('%s: deltas were not enough to %s. Still need to send entire state', this._peerId(), remotePeerId)
            remoteClock = await pushState()
          } else {
            // send only clock
            output.push(encode([null, [sendClockDiff(this._shared.clock())]]))
          }
        } else {
          debug('%s: remote %s does not need update', this._peerId(), remotePeerId)
        }
      } else {
        debug('%s: NOT pushing to %s', this._peerId(), remotePeerId)
        output.push(encode([null, [sendClockDiff(this._shared.clock())]]))
      }
    }

    const remoteNeedsUpdate = (_myClock) => {
      const myClock = _myClock || this._shared.clock()
      const remoteClock = this._clocks.getFor(remotePeerId)
      debug('%s: comparing local clock %j to remote clock %j', this._peerId(), myClock, remoteClock)
      const needs = !vectorclock.doesSecondHaveFirst(myClock, remoteClock)
      debug('%s: remote %s needs update?', this._peerId(), remotePeerId, needs)
      return needs && myClock
    }

    const reduceEntropy = () => {
      queue.add(() => {
        debug('%s: reduceEntropy to %s', this._peerId(), remotePeerId)
        if (remoteNeedsUpdate()) {
          return updateRemote(this._shared.clock())
        } else {
          debug('remote is up to date')
        }
      })
    }

    const debounceReduceEntropyMS = () => isPinner ? this._options.debouncePushToPinnerMS : this._options.debouncePushMS

    let debouncedReduceEntropy = debounce(reduceEntropy, debounceReduceEntropyMS())

    const onClockChanged = (newClock) => {
      debug('%s: clock changed to %j', this._peerId(), newClock)
      this._clocks.setFor(this._peerId(), newClock)
      debouncedReduceEntropy()
    }

    this._shared.on('clock changed', onClockChanged)
    debug('%s: registered state change handler', this._peerId())

    const gotPresentation = (message) => {
      debug('%s: got presentation message from %s:', this._peerId(), remotePeerId, message)
      const [newRemoteClock, startLazy, startEager, _isPinner] = message

      if (startLazy) {
        debug('%s: push connection to %s now in lazy mode', this._peerId(), remotePeerId)
        pushing = false
      }

      if (startEager) {
        debug('%s: push connection to %s now in eager mode', this._peerId(), remotePeerId)
        pushing = true
      }

      if ((typeof _isPinner) === 'boolean') {
        isPinner = _isPinner
        debouncedReduceEntropy = debounce(reduceEntropy, debounceReduceEntropyMS())
      }

      if (newRemoteClock) {
        remoteClock = newRemoteClock
        const mergedClock = this._clocks.setFor(remotePeerId, newRemoteClock, true, isPinner)
        this._replication.sent(remotePeerId, mergedClock, isPinner)
      }

      if (newRemoteClock || startEager) {
        reduceEntropy()
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
      this._clocks.takeDown(remotePeerId)
      if (!ended) {
        if (err && err.message !== 'underlying socket has been closed') {
          console.error(err.message)
          debug(err)
        }
        ended = true
        this._shared.removeListener('clock changed', onClockChanged)
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

  async _signAndEncryptDelta (deltaRecord) {
    const [previousClock, authorClock, [forName, typeName, decryptedState]] = deltaRecord
    const encryptedState = await this._signAndEncrypt(encode(decryptedState))
    return [previousClock, authorClock, [forName, typeName, encryptedState]]
  }

  _signAndEncrypt (data) {
    const { keys } = this._options
    return new Promise((resolve, reject) => {
      if (!keys.write) {
        return resolve(data)
      }
      keys.write.sign(data, (err, signature) => {
        if (err) {
          return reject(err)
        }

        const toEncrypt = encode([data, signature])

        keys.cipher()
          .then((cipher) => {
            cipher.encrypt(toEncrypt, (err, encrypted) => {
              if (err) {
                return reject(err)
              }

              resolve(encrypted)
            })
          })
          .catch(reject)
      })
    })
  }
}

/* eslint no-console: "off" */
'use strict'

const debug = require('debug')('peer-base:collaboration:push-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const debounce = require('lodash/debounce')
const Queue = require('p-queue')
const handlingData = require('../common/handling-data')
const encode = require('delta-crdts-msgpack-codec').encode
const vectorclock = require('../common/vectorclock')
const expectedNetworkError = require('../common/expected-network-error')
const EventEmitter = require('events')
const isUndefined = require('lodash/isUndefined')
const pEvent = require('p-event')
const peerToClockId = require('./peer-to-clock-id')

// const RGA = require('delta-crdts').type('rga')
// const chai = require('chai')
// chai.use(require('dirty-chai'))
// const expect = chai.expect

module.exports = class PushProtocol {
  constructor (ipfs, shared, clocks, keys, replication, collaboration, options) {
    this._ipfs = ipfs
    this._shared = shared
    this._clocks = clocks
    this._keys = keys
    this._replication = replication
    this._collaboration = collaboration
    this._options = options
  }

  forPeer (peerInfo) {
    const dbg = (...args) => debug('%s: ' + args[0], this._peerId(), ...args.slice(1))
    const remotePeerId = peerInfo.id.toB58String()
    dbg('push protocol to %s', remotePeerId)

    const queue = new Queue({ concurrency: 1 })
    let ended = false
    // Is the connection in eager (pushing) mode
    let pushing = true
    // Last clock sent to the remote peer
    let sentClock = {}
    // Our copy of the remote peer's clock
    let remoteClock = {}

    // Is the remote peer a pinner
    let isPinner
    // To find out if the remote peer is a pinner, we need to wait till it
    // sends us a message
    let pinnerInfoEmitter = new EventEmitter().setMaxListeners(0)
    const isPinnerPromise = () => isUndefined(isPinner) ? pEvent(pinnerInfoEmitter, 'isPinner') : isPinner

    // Send the diff between the local peer's clock and the remote peer's clock
    // to the remote peer
    const sendClockDiff = () => {
      const clock = this._shared.clock()
      const clockDiff = vectorclock.diff(sentClock, clock)
      sentClock = clock
      output.push(encode([null, [clockDiff]]))
    }

    // const pushDeltas = async (peerClock) => {
    //   const ds = this._shared.deltas(peerClock)
    //   let newRemoteClock = {}
    //   for (let d of ds) {
    //     const [clock, authorClock] = d
    //     newRemoteClock = vectorclock.merge(newRemoteClock, vectorclock.sumAll(clock, authorClock))
    //     output.push(encode([await this._signAndEncryptDelta(d)]))
    //   }

    //   return vectorclock.merge(peerClock, newRemoteClock)
    // }

    // Send deltas to the remote peer
    const pushDeltaBatches = async (peerClock) => {
      const batches = this._shared.deltaBatches(peerClock, remotePeerId)
      let newRemoteClock = {}
      for (let batch of batches) {
        const [clock, authorClock] = batch
        newRemoteClock = vectorclock.merge(newRemoteClock, vectorclock.sumAll(clock, authorClock))
        output.push(encode([await this._signAndEncryptDelta(batch)]))
      }

      return vectorclock.merge(peerClock, newRemoteClock)
    }

    // Send our full state to the remote peer
    const pushState = async () => {
      const states = this._collaboration.collaborationStatesAsDeltas()
      const encryptedStates = new Map()
      const clock = this._clocks.getFor(this._peerId())
      for (let [key, state] of states) {
        encryptedStates.set(key, await this._signAndEncryptDelta(state))
      }
      output.push(encode([null, [clock, encryptedStates]]))
      return clock
    }

    // Send the remote peer our clock, and send our state if we're in eager
    // mode
    const updateRemote = async (myClock) => {
      dbg('updateRemote %s', remotePeerId)

      // If we're in lazy mode, just send the clock (no state)
      if (!pushing) {
        dbg('in lazy mode so only sending clock to %s', remotePeerId)
        sendClockDiff()
        return
      }

      // We're in eager mode so send state
      this._replication.sending(remotePeerId, myClock, isPinner)
      dbg('pushing to %s', remotePeerId)

      // If the remote is a pinner, it can't read deltas so send the entire
      // state
      if (isPinner) {
        dbg('remote %s is a pinner - sending entire state', remotePeerId)
        remoteClock = await pushState()
        return
      }

      // If this peer is not a pinner we may have deltas to send
      if (!this._options.replicateOnly) {
        // remoteClock = await pushDeltas(remoteClock)
        remoteClock = vectorclock.merge(remoteClock, await pushDeltaBatches(remoteClock))
      }

      // If the remote still needs an update (even after sending the deltas
      // above), send the full state
      if (remoteNeedsUpdate(myClock, remoteClock)) {
        dbg('deltas were not enough to %s. Still need to send entire state', remotePeerId)
        remoteClock = vectorclock.merge(remoteClock, await pushState())
      } else {
        dbg('remote %s does not need update', remotePeerId)
      }
    }

    // The remote peer needs an update if the local peer has changes that the
    // remote peer doesn't know about
    const remoteNeedsUpdate = (_myClock, _remoteClock) => {
      const myClock = _myClock || this._shared.clock()
      const remoteClock = _remoteClock || this._clocks.getFor(remotePeerId)
      dbg('comparing local clock %j to remote clock %j', myClock, remoteClock)
      const needs = vectorclock.doesRemoteNeedUpdate(myClock, remoteClock, peerToClockId(remotePeerId))
      dbg('remote %s needs update? %s', remotePeerId, needs)
      return needs && myClock
    }

    // Check if the remote peer needs an update
    const reduceEntropy = async () => {
      await isPinnerPromise()
      if (queue.size >= 2) {
        return
      }
      queue.add(() => {
        dbg('reduceEntropy to %s', remotePeerId)
        if (remoteNeedsUpdate()) {
          return updateRemote(this._shared.clock())
        }

        dbg('remote is up to date, just sending clock')
        sendClockDiff()
      }).catch(onEnd)
    }
    const debouncedReduceEntropy = debounce(reduceEntropy, this._options.debouncePushMS, {
      maxWait: this._options.debouncePushMaxMS
    })
    const debouncedReduceEntropyToPinner = debounce(reduceEntropy, this._options.debouncePushToPinnerMS, {
      maxWait: this._options.debouncePushToPinnerMaxMS
    })

    // When the local state changes, send the clock (and state, if we're in
    // eager mode) to the remote peer
    const onClockChanged = (newClock) => {
      dbg('clock changed to %j', newClock)
      isPinner ? debouncedReduceEntropyToPinner() : debouncedReduceEntropy()
    }
    this._shared.on('clock changed', onClockChanged)
    dbg('registered state change handler')

    // Handle incoming message from remote peer
    const messageHandler = (message) => {
      dbg('got message from %s:', remotePeerId, message)
      const [newRemoteClock, startLazy, startEager, _isPinner] = message

      // Switch to lazy mode
      if (startLazy) {
        dbg('push connection to %s now in lazy mode', remotePeerId)
        pushing = false
      }

      // Switch to eager mode
      if (startEager) {
        dbg('push connection to %s now in eager mode', remotePeerId)
        pushing = true
      }

      // The remote peer is telling us whether or not it's a pinner
      if ((typeof _isPinner) === 'boolean') {
        const wasPinner = isPinner
        isPinner = _isPinner

        if (!wasPinner && isPinner) {
          // It was a pinner but is no longer
          this._replication.addPinner(remotePeerId)
        } else if (wasPinner && !isPinner) {
          // It is now a pinner
          this._replication.removePinner(remotePeerId)
        }

        pinnerInfoEmitter.emit('isPinner', isPinner)
      }

      // If the remote sent us its clock, update our local copy
      if (newRemoteClock) {
        if (isPinner) {
          // If the remote is a pinner, assume its clock is authoritative
          remoteClock = newRemoteClock
        } else {
          // If the remote is a regular peer, just merge in the remote clock
          remoteClock = vectorclock.merge(remoteClock, newRemoteClock)
        }
        const mergedClock = this._clocks.setFor(remotePeerId, newRemoteClock, true, isPinner)
        this._replication.sent(remotePeerId, mergedClock, isPinner)
      }

      // We have a new clock from the remote peer, so check if we need to send
      // it some state
      if (newRemoteClock || startEager) {
        reduceEntropy()
      }
    }

    const onMessage = (err, message) => {
      if (err) {
        console.error('error parsing message:', err.message)
        debug('error parsing message:', err)
        onEnd(err)
      } else {
        dbg('got message:', message)
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
        dbg('ending connection to %s', remotePeerId)
        ended = true

        if (err && expectedNetworkError(err)) {
          console.warn('%s: pull conn to %s ended with error', remotePeerId, err.message)
          err = null
        }
        this._shared.removeListener('clock changed', onClockChanged)
        this._collaboration.removeListener('stopped', onEnd)
        output.end(err)

        if (isPinner) {
          this._replication.removePinner(remotePeerId)
        }
      }
    }
    this._collaboration.once('stopped', onEnd)

    const input = pull.drain(handlingData(onMessage), onEnd)
    const output = pushable()

    // Tell the remote whether or not the local peer is a pinner
    output.push(encode([null, null, { isPinner: this._options.replicateOnly }]))

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
    let encryptedState
    if (this._options.replicateOnly) {
      encryptedState = decryptedState
    } else {
      encryptedState = await this._signAndEncrypt(encode(decryptedState))
    }
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

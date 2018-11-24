'use strict'

const debug = require('debug')('peer-star:collaboration:push-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const Queue = require('p-queue')
const debounce = require('lodash/debounce')
const handlingData = require('../common/handling-data')
const encode = require('delta-crdts-msgpack-codec').encode
const vectorclock = require('../common/vectorclock')

module.exports = class PushProtocol {
  constructor (ipfs, store, clocks, keys, replication, options) {
    this._ipfs = ipfs
    this._store = store
    this._clocks = clocks
    this._keys = keys
    this._replication = replication
    this._options = options
  }

  forPeer (peerInfo) {
    const remotePeerId = peerInfo.id.toB58String()
    debug('%s: push protocol to %s', this._peerId(), remotePeerId)
    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let pushing = true
    let isPinner = false
    let sentClock = {}

    const sendClockDiff = (clock) => {
      const clockDiff = vectorclock.diff(sentClock, clock)
      sentClock = clock
      return clockDiff
    }

    const pushDeltaBatch = async () => {
      debug('%s: push deltas to %s', this._peerId(), remotePeerId)
      const since = this._clocks.getFor(remotePeerId)
      const batch = await this._store.deltaBatch(since)
      debug('%s: batch to %s:', this._peerId(), remotePeerId, batch)
      for (let collab of batch.keys()) {
        const collabBatch = batch.get(collab)
        let [clock, authorClock] = collabBatch
        clock = vectorclock.incrementAll(clock, authorClock)
        this._clocks.setFor(remotePeerId, clock)
        output.push(encode([collabBatch]))
      }
    }

    const updateRemote = async (myClock) => {
      debug('%s: updateRemote %s', this._peerId(), remotePeerId)
      if (pushing) {
        debug('%s: pushing to %s', this._peerId(), remotePeerId)
        // Let's try to see if we have deltas to deliver
        if (!isPinner) {
          await pushDeltaBatch()
        }

        if (isPinner || remoteNeedsUpdate(myClock)) {
          if (pushing) {
            debug('%s: deltas were not enough to %s. Still need to send entire state', this._peerId(), remotePeerId)
            // remote still needs update
            const clockAndStates = await this._store.getClockAndStates()
            debug('clock and states: ', clockAndStates)
            const [clock] = clockAndStates
            if (Object.keys(clock).length) {
              debug('%s: clock of %s now is %j', this._peerId(), remotePeerId, clock)
              this._clocks.setFor(remotePeerId, clock)
              debug('%s: sending clock and states to %s:', this._peerId(), remotePeerId, clockAndStates)
              output.push(encode([null, clockAndStates]))
            }
          } else {
            // send only clock
            output.push(encode([null, [this._clocks.getFor(this._peerId())]]))
          }
        } else {
          debug('%s: remote %s does not need update', this._peerId(), remotePeerId)
        }
      } else {
        debug('%s: NOT pushing to %s', this._peerId(), remotePeerId)
        output.push(encode([null, [sendClockDiff(this._clocks.getFor(this._peerId()))]]))
      }
    }

    const remoteNeedsUpdate = (_myClock) => {
      const myClock = _myClock || this._clocks.getFor(this._peerId())
      const remoteClock = this._clocks.getFor(remotePeerId)
      debug('%s: comparing local clock %j to remote clock %j', this._peerId(), myClock, remoteClock)
      const needs = !vectorclock.doesSecondHaveFirst(myClock, remoteClock)
      debug('%s: remote %s needs update?', this._peerId(), remotePeerId, needs)
      return needs
    }

    const reduceEntropy = () => {
      debug('%s: reduceEntropy to %s', this._peerId(), remotePeerId)
      if (remoteNeedsUpdate()) {
        return updateRemote(this._clocks.getFor(this._peerId()))
      } else {
        debug('remote is up to date')
      }
    }

    const debounceReduceEntropyMS = () => isPinner ? this._options.debouncePushToPinnerMS : this._options.debouncePushMS

    let debouncedReduceEntropy = debounce(() => {
      queue.add(reduceEntropy).catch(onEnd)
    }, debounceReduceEntropyMS())

    const onClockChanged = (newClock) => {
      debug('%s: clock changed to %j', this._peerId(), newClock)
      this._clocks.setFor(this._peerId(), newClock)
      debouncedReduceEntropy()
    }

    this._store.on('clock changed', onClockChanged)
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
        debouncedReduceEntropy = debounce(() => {
          queue.add(reduceEntropy).catch(onEnd)
        }, debounceReduceEntropyMS())
      }

      if (newRemoteClock) {
        const mergedClock = this._clocks.setFor(remotePeerId, newRemoteClock, true, isPinner)
        this._replication.sent(remotePeerId, mergedClock, isPinner)
      }

      if (newRemoteClock || startEager) {
        queue.add(async () => {
          const myClock = await this._store.getLatestClock()
          this._clocks.setFor(this._peerId(), myClock)
          await reduceEntropy()
        }).catch(onEnd)
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
        this._store.removeListener('clock changed', onClockChanged)
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

'use strict'

const debug = require('debug')('peer-star:collaboration:push-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const Queue = require('p-queue')
const handlingData = require('../common/handling-data')
const encode = require('../common/encode')
const vectorclock = require('../common/vectorclock')

module.exports = class PushProtocol {
  constructor (ipfs, store, clocks, keys, options) {
    this._ipfs = ipfs
    this._store = store
    this._clocks = clocks
    this._keys = keys
    this._options = options
  }

  forPeer (peerInfo) {
    const remotePeerId = peerInfo.id.toB58String()
    debug('%s: push protocol to %s', this._peerId(), remotePeerId)
    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let pushing = true

    const pushDeltas = () => {
      debug('%s: pushing deltas to %s', this._peerId(), remotePeerId)
      return new Promise((resolve, reject) => {
        pull(
          this._store.deltaStream(this._clocks.getFor(remotePeerId)),
          pull.map(([previousClock, author, delta]) => {
            debug('%s: delta:', this._peerId(), delta)
            if (pushing) {
              const pushedClock = vectorclock.increment(previousClock, author)
              this._clocks.setFor(remotePeerId, pushedClock)
              // TODO: consider sending only clock deltas
              output.push(encode([[previousClock, author, delta]]))
            }
          }),
          pull.onEnd((err) => {
            debug('%s: delta stream ended', this._peerId(), err)
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          }))
      })
    }

    const updateRemote = async () => {
      if (pushing) {
        debug('updating remote')
        // Let's try to see if we have deltas to deliver
        await pushDeltas()
        if (remoteNeedsUpdate()) {
          if (pushing) {
            debug('%s: deltas were not enough to %s. Still need to send entire state', this._peerId(), remotePeerId)
            // remote still needs update
            const clockAndState = await this._store.getClockAndState()
            debug('clock and state: ', clockAndState)
            const [clock] = clockAndState
            if (Object.keys(clock).length) {
              this._clocks.setFor(remotePeerId, clock)
              debug('%s: sending clock and state to %s:', this._peerId(), remotePeerId, clockAndState)
              output.push(encode([null, clockAndState]))
            }
          } else {
            // send only clock
            const myClock = this._clocks.getFor(this._peerId())
            output.push(encode([null, [myClock]]))
          }
        }
      } else {
        const myClock = this._clocks.getFor(this._peerId())
        output.push(encode([null, [myClock]]))
      }
    }

    const remoteNeedsUpdate = () => {
      const myClock = this._clocks.getFor(this._peerId())
      const remoteClock = this._clocks.getFor(remotePeerId)
      debug('%s: comparing local clock %j to remote clock %j', this._peerId(), myClock, remoteClock)
      return (vectorclock.compare(myClock, remoteClock) >= 0) &&
             (!vectorclock.isIdentical(myClock, remoteClock))
    }

    const reduceEntropy = () => {
      if (remoteNeedsUpdate()) {
        return updateRemote()
      } else {
        debug('remote is up to date')
      }
    }

    const onClockChanged = (newClock) => {
      debug('clock changed to %j', newClock)
      this._clocks.setFor(this._peerId(), newClock)
      queue.add(reduceEntropy).catch(onEnd)
    }

    this._store.on('clock changed', onClockChanged)
    debug('%s: registered state change handler', this._peerId())

    const gotPresentation = (message) => {
      debug('%s: got presentation message from %s:', this._peerId(), remotePeerId, message)
      const [newRemoteClock, startLazy, startEager] = message

      if (startLazy) {
        debug('%s: push connection to %s now in lazy mode', this._peerId(), remotePeerId)
        pushing = false
      }

      if (startEager) {
        debug('%s: push connection to %s now in eager mode', this._peerId(), remotePeerId)
        pushing = true
      }

      if (newRemoteClock) {
        this._clocks.setFor(remotePeerId, newRemoteClock)
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
      if (!ended) {
        if (err) {
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

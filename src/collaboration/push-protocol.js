'use strict'

const debug = require('debug')('peer-star:collaboration:push-protocol')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const vectorclock = require('vectorclock')
const Queue = require('p-queue')
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
    const queue = new Queue({ concurrency: 1 })
    let ended = false
    let pushing = true
    let remoteClock = null
    let localClock = null
    let pushedClock = null

    const pushDeltas = () => {
      return new Promise((resolve, reject) => {
        pull(
          this._store.deltaStream(remoteClock),
          pull.map(([clock, delta]) => {
            if (pushing) {
              pushedClock = clock
              output.push([clock, delta])
            }
          }),
          pull.onEnd((err) => {
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
        // Let's try to see if we have deltas to deliver
        await pushDeltas()
        if (remoteNeedsUpdate()) {
          if (pushing) {
            // remote still needs update
            const clockAndState = await this._store.getClockAndState()
            pushedClock = clockAndState[0]
            output.push(encode(clockAndState))
          } else {
            // send only clock
            output.push(encode([localClock]))
          }
        }
      } else {
        const clock = await this._store.getLatestClock()
        output.push(encode([clock]))
      }
    }

    const remoteNeedsUpdate = () => {
      debug('%s: comparing local clock %j to remote clock %j', this._peerId(), localClock, remoteClock)
      return localClock &&
          (!remoteClock || !pushedClock ||
            (vectorclock.compare(localClock, remoteClock) >= 0 &&
            !vectorclock.isIdentical(localClock, remoteClock) &&
            !vectorclock.isIdentical(localClock, pushedClock)))
    }

    const reduceEntropy = () => {
      if (remoteNeedsUpdate()) {
        return updateRemote()
      }
    }

    const onClockChanged = (newClock) => {
      localClock = newClock
      queue.add(reduceEntropy).catch(onEnd)
    }

    this._store.on('clock changed', onClockChanged)
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
        queue.add(() => {
          this._store.getLatestClock()
            .then((latestClock) => {
              localClock = latestClock
              return reduceEntropy()
            })
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

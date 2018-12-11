/* eslint no-console: "off", no-warning-comments: "off" */
'use strict'

const debug = require('debug')('peer-base:discovery')
const EventEmitter = require('events')
const Queue = require('p-queue')
const delay = require('delay')

const HAPPENS_ERROR_CODES = [
  'CONNECTION_FAILED'
]

const HAPPENS_ERRORS = [
  'The libp2p node is not started yet',
  'Stream ended prematurely',
  'Circuit not enabled!'
]

const defaultOptions = {
  maxThrottleDelayMS: 5000
}

module.exports = class Discovery extends EventEmitter {
  constructor (appTopic, ipfs, discovery, ring, inboundConnections, outboundConnections, options) {
    super()

    this._options = Object.assign({}, defaultOptions, options)

    this._appTopic = appTopic
    this._discovery = discovery
    this._ring = ring
    this._inboundConnections = inboundConnections
    this._outboundConnections = outboundConnections
    this._ipfs = ipfs

    this._stopped = true

    this._queue = new Queue({ concurrency: 1 }) // TODO: make this an option
    this._peersPending = []

    this._peerDiscovered = this._peerDiscovered.bind(this)
  }

  start (callback) {
    debug('starting discovery')
    this._stopped = false
    this._discovery.on('peer', this._peerDiscovered)
    this.emit('start')
    return this._discovery.start(callback)
  }

  stop (callback) {
    debug('stopping discovery')
    this._stopped = true
    this._discovery.removeListener('peer', this._peerDiscovered)
    this._queue.clear()
    this.emit('stop')
    return this._discovery.stop(callback)
  }

  _peerDiscovered (peerInfo) {
    this._peersPending.push(peerInfo)
    this._queue.add(() => this._maybeDiscoverOneRandomPeer())
  }

  _maybeDiscoverOneRandomPeer () {
    const peer = this._pickRandomPendingPeer()
    if (peer) {
      if (this._ring.has(peer)) {
        return
      }
      return this._throttledMaybeDiscoverPeer(peer)
    }
  }

  _throttledMaybeDiscoverPeer (peerInfo) {
    return delay(this._delayTime())
      .then(() => this._maybeDiscoverPeer(peerInfo))
  }

  _maybeDiscoverPeer (peerInfo) {
    if (this._stopped) {
      return
    }

    if (this._ring.has(peerInfo)) {
      return
    }

    debug('maybe discover peer %j', peerInfo)

    return new Promise((resolve, reject) => {
      this._isInterestedInApp(peerInfo)
        .then((isInterestedInApp) => {
          if (isInterestedInApp) {
            debug('peer %s is interested', peerInfo.id.toB58String())
            this._ring.add(peerInfo)
            resolve()
          } else {
            // peer is not interested. maybe disconnect?
            this._ipfs._libp2pNode.hangUp(peerInfo, (err) => {
              if (err) {
                reject(err)
              } else {
                resolve()
              }
            })
          }
        })
        .catch((err) => {
          this._maybeLogError(err)
          resolve()
        })
    })
  }

  _isInterestedInApp (peerInfo) {
    if (Buffer.isBuffer(peerInfo) || Array.isArray(peerInfo)) {
      throw new Error('needs peer info!')
    }

    if (this._stopped) {
      return
    }

    // TODO: refactor this, PLEASE!
    return new Promise((resolve, reject) => {
      const idB58Str = peerInfo.id.toB58String()

      debug('finding out whether peer %s is interested in app', idB58Str)

      if (!this._inboundConnections.has(peerInfo)) {
        this._outboundConnections.add(peerInfo)
      }

      this._ipfs._libp2pNode.dial(peerInfo, (err) => {
        if (err) {
          return reject(err)
        }

        debug('dialed %s', idB58Str)

        // we're connected to the peer
        // let's wait until we know the peer subscriptions

        const pollTimeout = 500 // TODO: this should go to config
        let tryUntil = Date.now() + 5000 // TODO: this should go to config

        const pollPeer = () => {
          debug('polling %s', idB58Str)
          this._ipfs.pubsub.peers(this._appTopic, (err, peers) => {
            if (err) {
              return reject(err)
            }
            if (peers.indexOf(idB58Str) >= 0) {
              debug('peer %s is interested in app', idB58Str)
              resolve(true)
            } else {
              debug('peer %s not subscribed to app', idB58Str)
              maybeSchedulePeerPoll()
            }
          })
        }

        const maybeSchedulePeerPoll = () => {
          if (!this._stopped && (Date.now() < tryUntil)) {
            debug('scheduling poll to %s in %d ms', idB58Str, pollTimeout)
            setTimeout(pollPeer, pollTimeout)
          } else {
            resolve(false)
          }
        }

        maybeSchedulePeerPoll()
      })
    })
  }

  _delayTime () {
    // return 0
    return Math.floor(Math.random() * this._options.maxThrottleDelayMS) // TODO: make this value an option
  }

  _maybeLogError (err) {
    if ((HAPPENS_ERROR_CODES.indexOf(err.code) < 0) && (HAPPENS_ERRORS.indexOf(err.message) < 0)) {
      console.error('error caught while finding out if peer is interested in app', err)
    }
  }

  _pickRandomPendingPeer () {
    const index = Math.floor(Math.random() * this._peersPending.length)
    const peer = this._peersPending[index]
    this._peersPending.splice(index, 1)
    return peer
  }
}

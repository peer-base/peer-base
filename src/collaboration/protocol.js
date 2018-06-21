'use strict'

const debug = require('debug')('peer-star:collaboration:protocol')
const EventEmitter = require('events')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const vectorclock = require('vectorclock')
const Queue = require('p-queue')

module.exports = (...args) => {
  return new Protocol(...args)
}

class Protocol extends EventEmitter {
  constructor (ipfs, collaboration, store) {
    super()
    this._ipfs = ipfs
    this._collaboration = collaboration
    this._store = store
    this.handler = this.handler.bind(this)
  }

  name () {
    return `/peer-*/collab/${this._collaboration.name}`
  }

  handler (protocol, conn) {
    conn.getPeerInfo((err, peerInfo) => {
      if (err) {
        console.error('%s: error getting peer info:', this._peerId(), err.message)
        debug('%s: error getting peer info:', this._peerId(), this.err)
        return this.emit('error', err)
      }

      this.emit('inbound connection', peerInfo)

      pull(
        conn,
        this._pullProtocol(peerInfo),
        passthrough((err) => {
          if (err) {
            console.error(`connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
            debug(`${this._peerId()}: connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
          }
          this.emit('inbound connection closed', peerInfo)
        }),
        conn
      )
    })
  }

  dialerFor (peerInfo, conn) {
    this.emit('outbound connection', peerInfo)

    pull(
      conn,
      this._pushProtocol(peerInfo),
      passthrough((err) => {
        if (err) {
          console.error(`connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
          debug(`${this._peerId()}: connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
        }
        this.emit('outbound connection closed', peerInfo)
      }),
      conn
    )
  }

  /* ---- 1: pull protocol */

  _pullProtocol (peerInfo) {
    debug('%s: pull protocol to %s', this._peerId(), peerInfo.id.toB58String())
    let ended = false
    const queue = new Queue({ concurrency: 1 })

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
        if (clock && state) {
          if (await this._store.contains(clock)) {
            // we already have this state
            // send a "prune" message
            output.push(encode([null, true]))
          } else {
            await this._store.saveState([clock, state])
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

  /* ---- 2: push protocol */

  _pushProtocol (peerInfo) {
    debug('%s: push protocol to %s', this._peerId(), peerInfo.id.toB58String())
    let ended = false
    let pushing = true
    let vc = null
    let pushedVC = {}

    const onNewState = (newState) => {
      debug('%s: new state', this._peerId(), newState)
      if (!ended && vc) {
        const [newVC, state] = newState
        if (vectorclock.compare(newVC, vc) >= 0 &&
            !vectorclock.isIdentical(newVC, vc) &&
            !vectorclock.isIdentical(newVC, pushedVC)) {
          pushedVC = vectorclock.merge(pushedVC, newVC)
          if (pushing) {
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
      debug('%s: got presentation message from %s:', this._peerId(), peerInfo.id.toB58String(), message.toString())
      const [remoteClock, startLazy, startEager] = message
      if (remoteClock) {
        vc = vectorclock.merge(vc || {}, remoteClock)
        this._store.getClockAndState()
          .then(onNewState)
          .catch((err) => {
            console.error('%s: error getting latest clock and state: ', this._peerId(), err.message)
            debug('%s: error getting latest clock and state: ', this._peerId(), err)
          })
      }

      if (startLazy) {
        debug('%s: push connection to %s now in lazy mode', this._peerId(), peerInfo.id.toB58String())
        pushing = false
      }

      if (startEager) {
        debug('%s: push connection to %s now in eager mode', this._peerId(), peerInfo.id.toB58String())
        pushing = true
      }
    }

    let messageHandler = gotPresentation

    const onMessage = (err, message) => {
      if (err) {
        console.error('error parsing message:', err.message)
        debug('error parsing message:', err)
        onEnd(err)
      } else {
        debug('%s: got message:', this._peerId(), message.toString())
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

/* -------------------- */

function handlingData (dataHandler) {
  return (data) => {
    let message
    try {
      message = decode(data)
    } catch (err) {
      dataHandler(err)
    }

    dataHandler(null, message)
    return true
  }
}

function decode (data) {
  return JSON.parse(data.toString())
}

function encode (data) {
  return Buffer.from(JSON.stringify(data))
}

function passthrough (_onEnd) {
  const onEnd = (err) => {
    try {
      _onEnd(err)
    } catch (err2) {
      if (err2) {
        console.error('error in onEnd handler:', err2)
      }
    }
  }
  return pull.through(
    null,
    onEnd)
}

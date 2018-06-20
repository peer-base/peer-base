'use strict'

const debug = require('debug')('peer-star:collab-protocol')
const EventEmitter = require('events')
const pull = require('pull-stream')
const pushable = require('pull-pushable')
const vectorclock = require('vectorclock')

module.exports = (...args) => {
  return new Protocol(...args)
}

class Protocol extends EventEmitter {
  constructor (collaboration, store) {
    super()
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
        console.error('error getting peer info:', peerInfo)
        return this.emit('error', err)
      }

      this.emit('inbound connection', peerInfo)

      pull(
        conn,
        this._pullProtocol(peerInfo),
        passthrough((err) => {
          if (err) {
            console.error(`connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
            debug(err)
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
      conn,
      pull.onEnd((err) => {
        if (err) {
          console.error(`connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
          debug(err)
        }
        this.emit('outbound connection closed', peerInfo)
      })
    )
  }

  /* ---- 1: pull protocol */

  _pullProtocol (peerInfo) {
    let ended = false

    const onNewState = ([clock]) => {
      console.log('pull new state', clock)
      output.push(encode([clock]))
    }
    this._store.on('state changed', onNewState)

    const onData = (err, data) => {
      if (err) {
        console.error('error in parsing remote data:', err.message)
        debug('error in parsing remote data:', err)
      }
      const [clock, state] = data
      if (clock && state) {
        this._store.saveState([clock, state])
          .catch((err) => {
            this.emit('error', err)
          })
      }

      return true // keep the stream alive
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
    const input = pull.drain(handlingData(onData), onEnd)
    const output = pushable()

    this._store.getLatestClock()
      .then((vectorClock) => {
        output.push(encode([vectorClock]))
      })
      .catch(onEnd)

    return { sink: input, source: output }
  }

  /* ---- 2: push protocol */

  _pushProtocol (peerInfo) {
    let ended = false
    let pushing = true
    let vc = {}
    let pushedVC = {}

    const onNewState = (newState) => {
      if (!ended) {
        const [newVC, state] = newState
        if (vectorclock.compare(newVC, vc) >= 0
            && !vectorclock.isIdentical(newVC, vc)
            && !vectorclock.isIdentical(newVC, pushedVC)) {
          pushedVC = vectorclock.merge(pushedVC, newVC)
          if (pushing) {
            console.log('sending new state', newState)
            output.push(encode([newVC, state]))
          } else {
            output.push(encode([newVC]))
          }
        }
      }
    }

    this._store.on('state changed', onNewState)

    const gotPresentation = (message) => {
      const [remoteClock] = message
      vc = vectorclock.merge(vc, remoteClock)
    }

    let messageHandler = gotPresentation

    const onMessage = (err, message) => {
      if (err) {
        console.error('error parsing message:', err.message)
        debug('error parsing message:', err)
        onEnd(err)
      } else {
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
}

/* --------------------*/

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

function passthrough (onEnd) {
  return pull.through(
    null,
    onEnd)
}

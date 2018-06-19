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
        pull.map((d) => {
          console.log('-----> ', d.toString())
          return d
        }),
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
    const onData = (data) => {
      console.log('pull got data:', data.toString())
      return true // keep the stream alive
    }

    const onEnd = (err) => {
      if (!ended) {
        if (err) {
          console.error(err.message)
          debug(err)
        }
        ended = true
        output.end(err)
      }
    }
    const input = pull.drain(onData, onEnd)
    const output = pushable()

    this._store.getLatestVectorClock()
      .then((vectorClock) => {
        console.log('got vector clock', vectorClock)
        output.push(encode([vectorClock || {}]))
      })
      .catch(onEnd)

    return { sink: input, source: output }
  }

  /* ---- 2: push protocol */

  _pushProtocol (peerInfo) {
    let ended = false
    let vc = {}

    const newOpHandler = (op) => {
      if (!ended) {
        output.push(JSON.stringify(op))
      }
    }

    this._store.on('op', newOpHandler)

    const gotPresentation = (message) => {
      const [remoteVectorClock] = message
      console.log('remote vector clock:', remoteVectorClock)
      vc = vectorclock.merge(vc, remoteVectorClock)
      console.log('merged vc:', vc)
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
        this._store.on('op', newOpHandler)
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

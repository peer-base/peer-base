'use strict'

const debug = require('debug')('peer-star:collab-protocol')
const EventEmitter = require('events')
const pull = require('pull-stream')
const pushable = require('pull-pushable')

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
        conn,
        pull.onEnd((err) => {
          if (err) {
            console.error(`connection to ${peerInfo.id.toB58String()} ended with error: ${err.message}`)
            debug(err)
          }
          this.emit('inbound connection closed', peerInfo)
        })
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

  _pullProtocol (peerInfo) {
    let ended = false
    const onData = (data) => {
      console.log('got data:', data.toString())
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
      .then((vectorClock) => output.push(encode(vectorClock || {})))
      .catch(onEnd)

    return { sink: input, source: output }
  }

  _pushProtocol (peerInfo) {
    let ended = false
    const gotPresentation = (message) => {
      console.log('got presentation', message)
    }

    let dataHandler = gotPresentation
    const onData = (data) => {
      let message
      console.log('got data:', data.toString())
      try {
        message = decode(data)
      } catch (err) {
        console.log(err)
        onEnd(err)
      }

      dataHandler(message)
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

    return { sink: input, source: output }
  }
}

function decode (data) {
  return JSON.parse(data.toString())
}

function encode (data) {
  return Buffer.from(JSON.stringify(data))
}

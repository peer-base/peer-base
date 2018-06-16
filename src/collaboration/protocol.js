'use strict'

const EventEmitter = require('events')

module.exports = (...args) => {
  return new Protocol(...args)
}

class Protocol extends EventEmitter {
  constructor (collaborationName) {
    super()
    this._collaborationName = collaborationName
    this.handler = this.handler.bind(this)
  }

  name () {
    return `/peer-*/collab/${this._collaborationName}`
  }

  handler (protocol, conn) {
    this.emit('inbound connection')
    conn.getPeerInfo((err, peerInfo) => {
      if (err) {
        return this.emit('error', err)
      }

      this.emit('inbound connection', peerInfo)

      pull(
        conn,
        this._wireProtocol(peerInfo),
        conn,
        pull.onEnd((err) => {
          if (err) {
            console.error(err)
          }
          this.emit('inbound connection closed', peerInfo)
        })
      )
    })
  }

  dialerFor (peerInfo) {
    return (err, connection) => {
      this.emit('outbound connection', peerInfo)
      if (err) {
        console.error(err)
        return
      }

      pull(
        conn,
        this._wireProtocol(peerInfo),
        conn,
        pull.onEnd((err) => {
          if (err) {
            console.error(err)
          }
          this.emit('outbound connection closed', peerInfo)
        })
      )
    }
  }

  _wireProtocol (peerInfo) {

  }
}

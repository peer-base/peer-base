'use strict'

const EventEmitter = require('events')

module.exports = (...args) => new Gossip(...args)

class Gossip extends EventEmitter {
  constructor (appName, ipfs) {
    super()
    this._appName = appName
    this._ipfs = ipfs

    this.start = this.start.bind(this)

    this._pubSubHandler = this._pubSubHandler.bind(this)
    this._propagateError = this._propagateError.bind(this)
  }

  start () {
    this._ipfs.pubsub.subscribe(this._appName, this._pubSubHandler, (err) => {
      if (err) {
        if (err.message.indexOf('not started yet') >= 0) {
          this._ipfs.once('ready', this.start)
        } else {
          this._propagateError(err)
        }
      }
    })
  }

  stop (callback) {
    this._ipfs.pubsub.unsubscribe(this._appName, this._pubSubHandler, callback)
  }

  _pubSubHandler ({from, data}) {
    // TODO: handle
  }

  _propagateError (err) {
    this.emit('error', err)
  }
}

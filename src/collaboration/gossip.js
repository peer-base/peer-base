'use strict'

const EventEmitter = require('events')
const encode = require('../common/encode')
const decode = require('../common/decode')

module.exports = async (...args) => {
  const gossip = new Gossip(...args)
  await gossip.start()
  return gossip
}

class Gossip extends EventEmitter {
  constructor (ipfs, name, keys) {
    super()
    this._ipfs = ipfs
    this.name = name
    this._keys = keys

    this._pubSubHandler = this._pubSubHandler.bind(this)
  }

  start () {
    return new Promise((resolve, reject) => {
      this._ipfs.pubsub.subscribe(this.name, this._pubSubHandler, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
  }

  stop () {
    return new Promise((resolve, reject) => {
      this._ipfs.pubsub.unsubscribe(this.name, this._pubSubHandler, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
        this.emit('stopped')
      })
    })
  }

  broadcast (_message) {
    const message = encode(_message)
    this._keys.cipher().then((cipher) => {
      cipher.encrypt(message, (err, encrypted) => {
        if (err) {
          return console.error('Error encrypting message:', err)
        }

        this._ipfs.pubsub.publish(this.name, encrypted)
      })
    })
  }

  _pubSubHandler (_message) {
    this._keys.cipher().then((cipher) => {
      cipher.decrypt(_message.data, (err, decrypted) => {
        if (err) {
          return console.error('Error decrypting message:', err)
        }
        try {
          const message = decode(decrypted)
          this.emit('message', message, _message.from)
        } catch (err) {
          console.error('error caught while handling pubsub message:', err)
        }
      })
    })
  }
}
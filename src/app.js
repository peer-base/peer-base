'use strict'

const EventEmitter = require('events')
const Collaboration = require('./collaboration')
const IPFS = require('./transport/ipfs')

module.exports = (appName, options) => {
  return new App(appName, options)
}

class App extends EventEmitter {
  constructor (name, options) {
    super()
    this.name = name
    this.ipfs = IPFS(this, options && options.ipfs)
    this._collaborations = new Map()

    this._onGossipMessage = this._onGossipMessage.bind(this)
  }

  start () {
    return new Promise((resolve, reject) => {
      if (this.ipfs.isOnline()) {
        resolve()
      } else {
        this.ipfs.once('ready', resolve)
      }
    })
  }

  collaborate (name, options) {
    let collaboration = this._collaborations.get(name)
    if (!collaboration) {
      collaboration = Collaboration(this, name, options)
      this._collaborations.set(name, collaboration)
    }
    return collaboration
  }

  gossip (message) {
    if (this._gossip) {
      this._gossip.broadcast(message)
    }
  }

  setGossip (gossip) {
    this._gossip = gossip
    gossip.on('message', this._onGossipMessage)
  }

  _onGossipMessage (message) {
    this.emit('gossip', message)
  }

  stop () {
    return this.ipfs.stop()
  }
}

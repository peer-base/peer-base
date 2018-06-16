'use strict'

const EventEmitter = require('events')
const Collaboration = require('./collaboration')
const IPFS = require('./transport/ipfs')
const PeerCountGuess = require('./peer-count-guess')

module.exports = (appName, options) => {
  return new App(appName, options)
}

class App extends EventEmitter {
  constructor (name, options) {
    super()
    this.name = name
    this.ipfs = IPFS(this, options)
    this._peerCountGuess = new PeerCountGuess(this, options && options.peerCountGuess)
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
    }).then(() => this._peerCountGuess.start())
  }

  collaborate (name, options) {
    let collaboration = this._collaborations.get(name)
    if (!collaboration) {
      collaboration = Collaboration(this.ipfs, this, name, options)
      this._collaborations.set(name, collaboration)
      collaboration.once('stop', () => this._collaborations.delete(name))
      collaboration.start()
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

  peerCountGuess () {
    return this._peerCountGuess.guess()
  }

  _onGossipMessage (message) {
    this.emit('gossip', message)
    let collaborationName, membership
    try {
      [collaborationName, membership] = JSON.parse(message.data.toString())
    } catch (err) {
      console.log('error parsing gossip message:', err)
      return
    }

    if (this._collaborations.has(collaborationName)) {
      const collaboration = this._collaborations.get(collaborationName)
      collaboration.deliverRemoteMembership(membership)
        .catch((err) => {
          console.error('error delivering remote membership:', err)
        })
    }
  }

  stop () {
    this._collaborations.forEach((collaboration) => collaboration.stop())
    this._collaborations.clear()
    return this.ipfs.stop()
      .then(() => this._peerCountGuess.stop())
  }
}

'use strict'

const EventEmitter = require('events')
const Collaboration = require('./collaboration')
const IPFS = require('./transport/ipfs')
const PeerCountGuess = require('./peer-count-guess')
const decode = require('./common/decode')

module.exports = (appName, options) => {
  return new App(appName, options)
}

class App extends EventEmitter {
  constructor (name, options) {
    super()
    this.name = name
    this.ipfs = IPFS(this, options)
    this.ipfs.on('error', (err) => this.emit('error', err))
    this._peerCountGuess = new PeerCountGuess(this, options && options.peerCountGuess)
    this._collaborations = new Map()
    this._starting = null

    this._onGossipMessage = this._onGossipMessage.bind(this)
  }

  start () {
    if (this._starting) {
      return this._starting
    }
    this._starting = new Promise((resolve, reject) => {
      if (this.ipfs.isOnline()) {
        resolve()
      } else {
        this.ipfs.once('ready', resolve)
      }
    }).then(() => this._peerCountGuess.start())

    return this._starting
  }

  async collaborate (name, type, options) {
    if (!type) {
      throw new Error('need collaboration type')
    }
    let collaboration = this._collaborations.get(name)
    if (!collaboration) {
      if (!this._globalConnectionManager) {
        // wait until we have a global connection manager
        return new Promise((resolve, reject) => {
          this.once('global connection manager', () => {
            this.collaborate(name, type, options).then(resolve).catch(reject)
          })
        })
      }
      collaboration = Collaboration(true, this.ipfs, this._globalConnectionManager, this, name, type, options)
      this._collaborations.set(name, collaboration)
      collaboration.once('stop', () => this._collaborations.delete(name))
      await collaboration.start()
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

  setGlobalConnectionManager (globalConnectionManager) {
    this._globalConnectionManager = globalConnectionManager
    this.emit('global connection manager')
  }

  peerCountGuess () {
    return this._peerCountGuess.guess()
  }

  peerCountEstimate () {
    return this.peerCountGuess()
  }

  _onGossipMessage (message) {
    this.emit('gossip', message)
    this.ipfs.id().then((peerInfo) => {
      if (message.from === peerInfo.id) {
        return
      }
      let collaborationName, membership
      try {
        [collaborationName, membership] = decode(message.data)
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
    })
  }

  async stop () {
    try {
      await Promise.all(Array.from(this._collaborations.values()).map((collaboration) => collaboration.stop()))
    } catch (err) {
      console.error('error stopping collaborations:', err)
    }

    this._collaborations.clear()
    this._peerCountGuess.stop()
    await this.ipfs.stop()
  }
}

'use strict'

const EventEmitter = require('events')
const Collaboration = require('./collaboration')
const IPFS = require('./transport/ipfs')
const PeerCountGuess = require('./peer-count-guess')
const { decode } = require('delta-crdts-msgpack-codec')

module.exports = (appName, options) => {
  return new App(appName, options)
}

class App extends EventEmitter {
  constructor (name, options) {
    super()
    this.name = name
    this._options = options
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
      let replacing = false
      const ipfsOptions = (this._options && this._options.ipfs) || {}
      this.ipfs = IPFS(this, ipfsOptions)
      const onError = (err) => {
        if (err.message === 'websocket error') {
          if (!replacing && ipfsOptions.relay) {
            console.warn('You seem to be having some issues connecting to ' + JSON.stringify(ipfsOptions && ipfsOptions.swarm) + '. Downgrading to no swarm setup. Please refresh if that\'s not working for you.')
            replacing = true
            this.ipfs.removeListener('error', onError)
            this._options.ipfs.swarm = []
            this.ipfs = IPFS(this, this._options && this._options.ipfs)
            this.ipfs.on('error', (err) => this._handleIPFSError(err))
            this.ipfs.once('ready', resolve)
          } else {
            this.emit('error', err)
          }
        } else {
          this.emit('error', err)
        }
      }
      this.ipfs.on('error', onError)
      if (this.ipfs.isOnline()) {
        this.ipfs.on('error', (err) => this._handleIPFSError(err))
        resolve()
      } else {
        this.ipfs.once('ready', () => {
          this.ipfs.removeListener('error', onError)
          this.ipfs.on('error', (err) => this._handleIPFSError(err))
          resolve()
        })
      }
    }).then(() => {
      this._peerCountGuess.start()
    })

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
      collaboration.once('stopped', () => this._collaborations.delete(name))
      collaboration.on('error', (err) => {
        if (collaboration.listenerCount('error') === 1) { // self
          console.warn('error trapped in collaboration: you should listen to `error` events. Instead, we\'re forwarding this error to the app', err)
          this.emit('error', err)
        }
      })
    }
    await collaboration.start()
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

  _handleIPFSError (err) {
    console.error(err)
  }

  async stop ({ stopIPFS = true } = {}) {
    try {
      await Promise.all(Array.from(this._collaborations.values()).map((collaboration) => collaboration.stop()))
    } catch (err) {
      console.error('error stopping collaborations:', err)
    }

    if (this._gossip) {
      this._gossip.removeListener('message', this._onGossipMessage)
    }
    this._collaborations.clear()
    this._peerCountGuess.stop()
    if (stopIPFS) {
      await this.ipfs.stop()
    }
  }
}

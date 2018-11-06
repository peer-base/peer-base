'use strict'

const debug = require('debug')('peer-star:pinner')
const EventEmitter = require('events')
const Collaboration = require('../collaboration')
const IPFS = require('../transport/ipfs')
const PeerCountGuess = require('../peer-count-guess')
const { decode } = require('delta-crdts-msgpack-codec')

const defaultOptions = {
  collaborationInnactivityTimeoutMS: 60000
}

class AppPinner extends EventEmitter {
  constructor (name, options) {
    super()
    this.name = name
    this._options = Object.assign({}, defaultOptions, options)
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
      const ipfsOptions = (this._options && this._options.ipfs) || {}
      this.ipfs = IPFS(this, ipfsOptions)
      if (this.ipfs.isOnline()) {
        this.ipfs.on('error', (err) => this._handleIPFSError(err))
        resolve()
      } else {
        this.ipfs.once('ready', () => {
          this.ipfs.on('error', (err) => this._handleIPFSError(err))
          resolve()
        })
      }
    }).then(() => {
      this._peerCountGuess.start()
    })

    return this._starting
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
    debug('gossip message from %s', message.from)
    this.emit('gossip', message)
    this.ipfs.id().then((peerInfo) => {
      if (message.from === peerInfo.id) {
        return
      }
      let collaborationName, membership, type
      try {
        [collaborationName, membership, type] = decode(message.data)
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
      } else {
        debug('new collaboration %s of type %s', collaborationName, type)
        if (type) {
          const collaboration = this._addCollaboration(collaborationName, type)
          collaboration.start().then(() => {
            collaboration.deliverRemoteMembership(membership)
          })
        }
      }
    })
  }

  _addCollaboration (name, type) {
    debug('adding collaboration %j of type %j', name, type)
    const options = {
      replicateOnly: true,
      receiveTimeoutMS: 6000
    }
    const collaboration = Collaboration(true, this.ipfs, this._globalConnectionManager, this, name, type, options)
    this._collaborations.set(name, collaboration)

    const onInnactivityTimeout = () => {
      debug('collaboration %j timed out. Removing it...', name, type)
      collaboration.removeListener('state changed', onStateChanged)
      this._collaborations.delete(name)
      collaboration.stop().catch((err) => {
        console.error('error stopping collaboration ' + name + ':', err)
      })
    }

    let activityTimeout

    const resetActivityTimeout = () => {
      if (activityTimeout) {
        clearTimeout(activityTimeout)
      }
      setTimeout(onInnactivityTimeout, this._options.collaborationInnactivityTimeoutMS)
    }

    const onStateChanged = () => {
      debug('state changed in collaboration %s', name)
      resetActivityTimeout()
    }

    collaboration.on('state changed', onStateChanged)

    resetActivityTimeout()

    return collaboration
  }

  _handleIPFSError (err) {
    console.error(err)
  }

  async stop () {
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
    await this.ipfs.stop()
  }
}

module.exports = (appName, options) => {
  return new AppPinner(appName, options)
}

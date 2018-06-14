'use strict'

const Asino = require('asino')
const bs58 = require('bs58')

const defaultOptions = {
  periodWindowMS: 60000 // 1 minute
}

module.exports = class PeerCountGuess {
  constructor (app, options) {
    this._app = app
    this._options = Object.assign({}, defaultOptions, options)
    this._filters = []
    this._peerCountPerFilter = []

    this._rotate = this._rotate.bind(this)
    this._onGossip = this._onGossip.bind(this)
  }

  start () {
    this._filters = [Asino()]
    this._peerCountPerFilter = [0]
    this._rotationInterval = setInterval(this._rotate, Math.round(this._options.periodWindowMS / 2))
    this._app.on('gossip', this._onGossip)
  }

  stop () {
    this._app.removeListener('gossip', this._onGossip)
    clearInterval(this._rotationInterval)
    this._rotationInterval = null
    this._filters = []
    this._peerCountPerFilter = []
  }

  guess () {
    return this._peerCountPerFilter[0]
  }

  _onGossip (message) {
    const peerId = bs58.decode(message.from)
    this._filters.forEach((filter, index) => {
      const exists = filter.try(peerId)
      if (!exists) {
        this._peerCountPerFilter[index] += 1
      }
    })
  }

  _rotate () {
    if (this._filters.length > 1) {
      this._filters.shift()
      this._peerCountPerFilter.shift()
    }

    this._filters.push(Asino())
    this._peerCountPerFilter.push(0)
  }
}

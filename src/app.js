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

  stop () {
    return this.ipfs.stop()
  }
}

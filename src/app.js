'use strict'

const EventEmitter = require('events')
const Collaboration = require('./collaboration')
const awaitIpfsInit = require('./utils/await-ipfs-init')
const IPFS = require('./transport/ipfs')

module.exports = (appName, options) => {
  return new App(appName, options)
}

class App extends EventEmitter {
  constructor (name, options) {
    super()
    this.name = name
    this.ipfs = IPFS(name, options && options.ipfs)
    this._collaborations = new Map()
  }

  async start () {
    await awaitIpfsInit(this.ipfs)
  }

  collaborate (name, options) {
    let collaboration = this._collaborations.get(name)
    if (!collaboration) {
      collaboration = Collaboration(this, name, options)
    }
    return collaboration
  }

  stop () {
    return this.ipfs.stop()
  }
}

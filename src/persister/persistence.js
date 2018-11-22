'use strict'

const CID = require('cids')
const msgpack = require('delta-crdts-msgpack-codec')

const defaultOptions = {}

module.exports = class Persistence {
  constructor (ipfs, options) {
    this._ipfs = ipfs
    this._options = Object.assign({}, defaultOptions, options)
    this._codec = this._options.encoder || msgpack
  }

  start () {
    return new Promise(resolve => {
      this._ipfs.isOnline() ? resolve() : this._ipfs.once('ready', resolve)
    })
  }

  stop () {
    // Note: IPFS should be stopped by the process that passed it to this class
  }

  async fetch (cid) {
    const dagNode = await this._ipfs.dag.get(cid)
    const value = dagNode.value
    const data = this._codec.decode(value.data)
    return {
      parent: value.parent,
      clock: data.clock,
      record: data.record
    }
  }

  async save (parentCid, clock, record) {
    const data = await this._codec.encode({ clock, record })
    const dagNode = { data }
    if (parentCid) {
      dagNode.parent = { '/': parentCid.buffer }
    }
    return this._ipfs.dag.put(dagNode)
  }
}

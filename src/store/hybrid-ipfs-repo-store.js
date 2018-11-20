'use strict'

const pull = require('pull-stream')
const MemoryStore = require('./memory-store').klass
const { datastore } = require('./ipfs-repo-store')
const replicateStore = require('./replicate-store')

class HybridIpfsRepoStore extends MemoryStore {
  async start () {
    await super.start()
    this._persistentStore = await (datastore(this._ipfs, this._collaboration))
    await replicateStore(this._persistentStore, this._store)
  }

  save () {
    return replicateStore(this._store, this._persistentStore)
  }
}

module.exports = (...args) => new HybridIpfsRepoStore(...args)

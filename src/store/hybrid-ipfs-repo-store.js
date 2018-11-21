'use strict'

const pull = require('pull-stream')
const MemoryStore = require('./memory-store').klass
const { datastore } = require('./ipfs-repo-store')
const replicateStore = require('./replicate-store')

class HybridIpfsRepoStore extends MemoryStore {
  async start () {
    await super.start()
    this._changedKeys = new Set()
    this._removedKeys = new Set()
    this._persistentStore = await (datastore(this._ipfs, this._collaboration))
    await replicateStore(this._persistentStore, this._store)
  }

  _save (key, value) {
    this._changedKeys.add(key)
    return super._save(key, value)
  }

  _delete (key, callback) {
    this._removedKeys.add(key)
  }

  save () {
    const changedKeys = this._changedKeys
    this._changedKeys = new Set()
    const removedKeys = this._removedKeys
    this._removedKeys = new Set()
    return replicateStore(this._store, this._persistentStore, changedKeys, removedKeys)
  }
}

module.exports = (...args) => new HybridIpfsRepoStore(...args)

'use strict'

const MemoryStore = require('./memory-store').klass
const { datastore } = require('./ipfs-repo-store')
const replicateStore = require('./replicate-store')

class HybridIpfsRepoStore extends MemoryStore {
  async start () {
    await super.start()
    this._changedKeys = new Set()
    this._removedKeys = new Set()
    this._persistentStore = await (datastore(this._ipfs, this._collaboration))
    this._encrypt = this._encrypt.bind(this)
    this._decrypt = this._decrypt.bind(this)

    await replicateStore(this._persistentStore, this._store, { decrypt: this._decrypt })
  }

  _save (key, value) {
    this._changedKeys.add(key)
    return super._save(key, value)
  }

  _delete (key, callback) {
    this._removedKeys.add(key)
  }

  _encrypt (buffer, callback) {
    if (this._cipher) {
      this._cipher()
        .then((cipher) => cipher.encrypt(buffer, callback))
        .catch(callback)
    } else {
      callback(null, buffer)
    }
  }

  _decrypt (buffer, callback) {
    if (this._cipher) {
      this._cipher()
        .then((cipher) => cipher.decrypt(buffer, callback))
        .catch(callback)
    } else {
      callback(null, buffer)
    }
  }

  save () {
    const changedKeys = this._changedKeys
    this._changedKeys = new Set()
    const removedKeys = this._removedKeys
    this._removedKeys = new Set()
    return replicateStore(this._store, this._persistentStore, { encrypt: this._encrypt, changedKeys, removedKeys })
  }
}

module.exports = (...args) => new HybridIpfsRepoStore(...args)

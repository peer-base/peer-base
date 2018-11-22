'use strict'

const { MemoryDatastore } = require('interface-datastore')
const DatastoreStore = require('./datastore-store')
const NamespaceStore = require('datastore-core').NamespaceDatastore
const Key = require('interface-datastore').Key

class MemoryStore extends DatastoreStore {
  _createDatastore () {
    const ds = new MemoryDatastore()
    return new NamespaceStore(ds, new Key(`peer-star-collab-${this._collaboration.name}`))
  }

  get isPersistent () {
    return false
  }

  save () {
    throw new Error('memory store does not save to persistent storage')
  }
}

module.exports = (...args) => new MemoryStore(...args)

module.exports.klass = MemoryStore

'use strict'

const { NamespaceStore} = require('datastore-core')
const { Key, MemoryDatastore }  = require('interface-datastore')
const DatastoreStore = require('./datastore-store')

class MemoryStore extends DatastoreStore {
  _createDatastore () {
    return new MemoryDatastore()
  }

  save () {
    throw new Error('memory store does not save to persistent storage')
  }
}

module.exports = (...args) => new MemoryStore(...args)

module.exports.klass = MemoryStore


'use strict'

const datastore = require('./datastore-from-ipfs')
const DatastorePersistentStore = require('./datastore-persistent-store')

class IpfsRepoStore extends DatastorePersistentStore {
  _createDatastore () {
    return datastore(this._ipfs, this._collaboration)
  }

  async save () {
    this.emit('saved')
  }
}

module.exports = (...args) => new IpfsRepoStore(...args)

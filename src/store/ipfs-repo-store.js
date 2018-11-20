'use strict'

const NamespaceStore = require('datastore-core').NamespaceDatastore
const Key = require('interface-datastore').Key
const DatastorePersistentStore = require('./datastore-persistent-store')

class IpfsRepoStore extends DatastorePersistentStore {
  _createDatastore () {
    return datastore(this._ipfs, this._collaboration)
  }
}

module.exports = (...args) => new IpfsRepoStore(...args)

function datastore (ipfs, collaboration) {
  return new Promise((resolve, reject) => {
    const ds = ipfs._repo.datastore
    if (!ds) {
      return ipfs.once('start', () => {
        datastore(ipfs, collaboration).then(resolve).catch(reject)
      })
    }
    // resolve(ds)
    resolve(new NamespaceStore(ds, new Key(`peer-star-collab-${collaboration.name}`)))
  })
}

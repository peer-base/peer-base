'use strict'

const NamespaceStore = require('datastore-core').NamespaceDatastore
const Key = require('interface-datastore').Key

module.exports = class CollaborationStore {
  constructor (ipfs, collaboration) {
    this._ipfs = ipfs
    this._collaboration = collaboration
  }

  async start () {
    this._store = await datastore(this._ipfs, this._collaboration)
  }

  stop () {
    // TO DO
  }

  getLatestVectorClock () {
    return new Promise((resolve, reject) => {
      this._store.get('clock', parsingResult((err, clock) => {
        if (err) {
          return reject(err)
        }
        resolve(clock)
      }))
    })
  }
}

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

function parsingResult (callback) {
  return (err, result) => {
    if (err) {
      if (err.message.indexOf('Key not found') >= 0) {
        return callback(null, undefined)
      }
      return callback(err)
    }
    let parsed
    try {
      parsed = JSON.parse(result.toString())
    } catch (err) {
      callback(err)
      return
    }
    callback(null, parsed)
  }
}

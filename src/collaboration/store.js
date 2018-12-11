'use strict'

const NamespaceStore = require('datastore-core').NamespaceDatastore
const Key = require('interface-datastore').Key
const { encode, decode } = require('delta-crdts-msgpack-codec')

module.exports = class Store {
  constructor (ipfs, collaboration, options) {
    this._ipfs = ipfs
    this._collaboration = collaboration
    this._cipher = options.createCipher
  }

  async start () {
    this._store = await datastore(this._ipfs, this._collaboration)
  }

  stop () {
    // ???
  }

  async save (state, deltas, clock) {
    const toSave = await this._encode([state, deltas, clock])
    return this._saveRaw(toSave)
  }

  _saveRaw (state) {
    return new Promise((resolve, reject) => {
      this._store.put('/', state, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  load () {
    return new Promise((resolve, reject) => {
      this._store.get('/', (err, result) => {
        if (err) {
          if (err.code === 'ERR_NOT_FOUND') {
            resolve([])
          } else {
            reject(err)
          }
        } else {
          this._decode(result)
            .then(resolve)
            .catch(reject)
        }
      })
    })
  }

  _encode (value) {
    if (!this._cipher) {
      return encode(value)
    }
    return this._cipher().then((cipher) => {
      return new Promise((resolve, reject) => {
        cipher.encrypt(encode(value), (err, encrypted) => {
          if (err) {
            return reject(err)
          }
          resolve(encrypted)
        })
      })
    })
  }

  async _decode (bytes) {
    if (!this._cipher) {
      return decode(bytes)
    }
    return this._cipher().then((cipher) => {
      return new Promise((resolve, reject) => {
        cipher.decrypt(bytes, (err, decrypted) => {
          if (err) {
            return reject(err)
          }
          const decoded = decode(decrypted)
          resolve(decoded)
        })
      })
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
    resolve(new NamespaceStore(ds, new Key(`peer-base-collab-${collaboration.fqn()}`)))
  })
}

'use strict'

const debug = require('debug')('peer-star:collaboration:store')
const pull = require('pull-stream')
const NamespaceStore = require('datastore-core').NamespaceDatastore
const Key = require('interface-datastore').Key
const vectorclock = require('../common/vectorclock')

const LocalCollaborationStore = require('./local-collaboration-store')

class IpfsRepoStore extends LocalCollaborationStore {
  async start () {
    this._store = await datastore(this._ipfs, this._collaboration)
    this._seq = await this.getSequence()
    this._id = (await this._ipfs.id()).id
  }

  stop () {
    // TO DO
  }

  deltaStream (_since = {}) {
    let since = Object.assign({}, _since)
    debug('%s: delta stream since %j', this._id, since)

    return pull(
      this._store.query({
        prefix: '/d:'
      }),
      pull.asyncMap(({ value }, cb) => this._decode(value, cb)),
      pull.asyncMap((entireDelta, callback) => {
        const [previousClock, authorClock] = entireDelta
        if (vectorclock.isIdentical(previousClock, since)) {
          debug('accepting delta %j', [previousClock, authorClock])
          since = vectorclock.incrementAll(previousClock, authorClock)
          callback(null, entireDelta)
        } else {
          callback(null, null)
        }
      }),
      pull.filter(Boolean) // only allow non-null values
    )
  }

  _get (key) {
    return new Promise((resolve, reject) => {
      this._store.get(key, this._parsingResult((err, value) => {
        if (err) {
          return reject(err)
        }
        resolve(value)
      }))
    })
  }

  _saveEncoded (key, value) {
    return new Promise((resolve, reject) => {
      this._store.put(key, value, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  _trimDeltas () {
    this._trimmingDeltas = true
    return new Promise((resolve, reject) => {
      const seq = this._seq
      const first = Math.max(seq - this._options.maxDeltaRetention, 0)
      pull(
        this._store.query({
          prefix: '/d:',
          keysOnly: true
        }),
        pull.map((d) => d.key),
        pull.asyncMap((key, callback) => {
          const thisSeq = parseInt(key.toString().slice(3), 16)
          if (thisSeq < first) {
            debug('%s: trimming delta with sequence %s', this._id, thisSeq)
            this._store.delete(key, callback)
          } else {
            callback()
          }
        }),
        pull.onEnd((err) => {
          this._trimmingDeltas = false
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      )
    })
  }

  _isNotFoundError (err) {
    return (
      err.message.indexOf('Key not found') >= 0 ||
      err.message.indexOf('No value') >= 0 ||
      err.code === 'ERR_NOT_FOUND'
    )
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

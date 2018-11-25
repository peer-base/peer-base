'use strict'

const debug = require('debug')('peer-star:collaboration:store')
const pull = require('pull-stream')
const vectorclock = require('../common/vectorclock')

const LocalCollaborationStore = require('./local-collaboration-store')

module.exports = class DatastoreStore extends LocalCollaborationStore {
  async start () {
    await super.start()
    this._store = await this._createDatastore(this._ipfs, this._collaboration)
    this._seq = await this.getSequence()
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
        if (!vectorclock.isDeltaInteresting(entireDelta, since)) {
          return callback(null, null)
        }

        const [previousClock, authorClock] = entireDelta
        const deltaClock = vectorclock.sumAll(previousClock, authorClock)
        since = vectorclock.merge(since, deltaClock)
        callback(null, entireDelta)
      }),
      pull.filter(Boolean) // only allow non-null values
    )
  }

  async _id () {
    return this._ipfsId
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

  _delete (key, callback) {
    this._store.delete(key, callback)
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
            this._delete(key, callback)
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

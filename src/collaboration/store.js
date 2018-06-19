'use strict'

const EventEmitter = require('events')
const NamespaceStore = require('datastore-core').NamespaceDatastore
const Key = require('interface-datastore').Key
const Queue = require('p-queue')
const vectorclock = require('vectorclock')

module.exports = class CollaborationStore extends EventEmitter {
  constructor (ipfs, collaboration) {
    super()
    this._ipfs = ipfs
    this._collaboration = collaboration
    this._queue = new Queue({ concurrency: 1 })
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

  pushOperation (op) {
    return this._queue.add(async () => {
      const latest = await this.getLatestVector()
      const id = (await this._ipfs.id()).id
      const newClock = vectorclock.increment(latest, id)
      await this._saveOperation(newClock, op)
      await this._setLatestVectorClock(newClock)
      this.emit('op', { op, clock: newClock })
      return newClock
    })
  }

  _saveOperation (clock, op) {
    return new Promise((resolve, reject) => {
      this._store.put(JSON.stringify(clock), JSON.stringify(op), (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  _setLatestVectorClock (clock) {
    return new Promise((resolve, reject) => {
      this._store.put('clock', JSON.stringify(clock), (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
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

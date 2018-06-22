'use strict'

const debug = require('debug')('peer-star:collaboration:store')
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

  getLatestClock () {
    return new Promise((resolve, reject) => {
      this._store.get('clock', parsingResult((err, clock) => {
        if (err) {
          return reject(err)
        }
        resolve(clock || {})
      }))
    })
  }

  getClockAndState () {
    return this._queue.add(() => Promise.all(
      [this.getLatestClock(), this.getState()]))
  }

  saveState ([clock, state]) {
    debug('save state', [clock, state])
    // TODO: include parent vector clock
    // to be able to decide whether to ignore this state or not
    return this._queue.add(async () => {
      const latest = await this.getLatestClock()
      debug('latest vector clock:', latest)
      if (!clock) {
        const id = (await this._ipfs.id()).id
        clock = vectorclock.increment(latest, id)
        debug('new vector clock is:', clock)
      } else {
        if (await this._contains(clock)) {
          // we have already seen this state change, so discard it
          return
        }
        clock = vectorclock.merge(latest, clock)
      }

      await this._save('state', state)
      await this._save('clock', clock)
      debug('saved state and vector clock')
      this.emit('clock changed', clock)
      this.emit('state changed', state)
      debug('emitted state changed event')
      return clock
    })
  }

  getState () {
    return new Promise((resolve, reject) => {
      this._store.get('state', parsingResult((err, state) => {
        if (err) {
          reject(err)
        } else {
          resolve(state)
        }
      }))
    })
  }

  contains (clock) {
    return this._queue.add(() => this._contains(clock))
  }

  async _contains (clock) {
    const currentClock = await this.getLatestClock()
    const contains = (vectorclock.isIdentical(clock, currentClock) ||
      vectorclock.compare(clock, currentClock) < 0)
    debug('%j contains %j ?: %j', currentClock, clock, contains)
    return contains
  }

  _save (key, value) {
    return new Promise((resolve, reject) => {
      this._store.put(key, Buffer.from(JSON.stringify(value)), (err) => {
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
      if (isNotFoundError(err)) {
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

function isNotFoundError (err) {
  return (err.message.indexOf('Key not found') >= 0 || err.message.indexOf('No value') >= 0)
}

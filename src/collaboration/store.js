'use strict'

const debug = require('debug')('peer-star:collaboration:store')
const EventEmitter = require('events')
const NamespaceStore = require('datastore-core').NamespaceDatastore
const Key = require('interface-datastore').Key
const Queue = require('p-queue')
const vectorclock = require('../common/vectorclock')
const leftpad = require('leftpad')
const pull = require('pull-stream')

const decode = require('../common/decode')

module.exports = class CollaborationStore extends EventEmitter {
  constructor (ipfs, collaboration, merge) {
    super()
    this._ipfs = ipfs
    this._collaboration = collaboration

    if (typeof merge !== 'function') {
      throw new Error('need a merge function')
    }
    this._merge = merge

    this._queue = new Queue({ concurrency: 1 })
  }

  async start () {
    this._store = await datastore(this._ipfs, this._collaboration)
    this._seq = await this.getSequence()
  }

  stop () {
    // TO DO
  }

  async getSequence () {
    return (await this._get('/seq')) || 0
  }

  async getLatestClock () {
    return (await this._get('/clock')) || {}
  }

  _get (key) {
    return new Promise((resolve, reject) => {
      this._store.get(key, parsingResult((err, value) => {
        if (err) {
          return reject(err)
        }
        resolve(value)
      }))
    })
  }

  getClockAndState () {
    return Promise.all(
      [this.getLatestClock(), this.getState()])
  }

  saveDelta ([previousClock, author, delta]) {
    debug('save delta', [previousClock, author, delta])

    return this._queue.add(async () => {
      const latest = await this.getLatestClock()
      debug('latest vector clock:', latest)
      if (!previousClock) {
        previousClock = latest
        author = (await this._ipfs.id()).id
      } else if (!vectorclock.isIdentical(latest, previousClock)) {
        // disregard delta if it's not causally consistent
        return
      }

      const nextClock = vectorclock.increment(previousClock, author)
      debug('next clock is', nextClock)

      // check if parent vector clock is contained
      // and that new vector clock is not contained
      const previousClockComparison = vectorclock.compare(previousClock, latest)
      debug('previous clock comparison result:', previousClockComparison)
      if (previousClockComparison >= 0 && !vectorclock.isIdentical(previousClock, latest)) {
        debug('previous and latest are not identical', previousClock, latest)
        return
      }

      const nextClockComparison = vectorclock.compare(nextClock, latest)
      debug('next clock comparison result:', nextClockComparison)
      debug('latest is', latest)
      if (nextClockComparison < 0 || vectorclock.isIdentical(nextClock, latest)) {
        debug('is identical', nextClock, latest)
        return
      }

      const seq = this._seq + 1
      const deltaKey = '/d:' + leftpad(seq.toString(16), 20)

      // merge both states
      const state = await this.getState()
      let newState
      if (state !== undefined) {
        newState = this._merge(state, delta)
      } else {
        newState = delta
      }

      const deltaRecord = [previousClock, author, delta]

      await Promise.all([
        this._save(deltaKey, deltaRecord),
        this._save('/state', newState),
        this._save('/clock', nextClock),
        this._save('/seq', seq)
      ])

      debug('saved delta and vector clock')
      this.emit('delta', deltaRecord)
      this.emit('clock changed', nextClock)
      this.emit('state changed', newState)
      debug('emitted state changed event')
      return nextClock
    })
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

      const previousState = await this.getState()
      let newState

      if (previousState !== undefined) {
        newState = this._merge(previousState, state)
      } else {
        newState = state
      }

      await Promise.all([this._save('/state', newState), this._save('/clock', clock)])
      debug('saved state and vector clock')
      this.emit('clock changed', clock)
      this.emit('state changed', newState)
      debug('emitted state changed event')
      return clock
    })
  }

  async getState () {
    return this._get('/state')
  }

  deltaStream (since) {
    return pull(
      this._store.query({
        prefix: '/d:'
      }),
      pull.map((d) => decode(d.value)),
      pull.asyncMap(([previousClock, author, delta], callback) => {
        if (vectorclock.isIdentical(previousClock, since)) {
          since = vectorclock.increment(since, author)
          callback(null, [previousClock, author, delta])
        } else {
          callback(null, null)
        }
      }),
      pull.filter(Boolean) // only allow non-null values
    )
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

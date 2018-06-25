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
  constructor (ipfs, collaboration) {
    super()
    this._ipfs = ipfs
    this._collaboration = collaboration

    this._queue = new Queue({ concurrency: 1 })
  }

  async start () {
    this._store = await datastore(this._ipfs, this._collaboration)
    this._seq = await this.getSequence()
    this._id = (await this._ipfs.id()).id
  }

  setShared (shared) {
    this._shared = shared
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
    return this._queue.add(async () => {
      debug('%s: save delta: %j', this._id, [previousClock, author, delta])
      if (!previousClock) {
        previousClock = await this.getLatestClock()
        author = (await this._ipfs.id()).id
      }

      if (!await this._contains(previousClock)) {
        debug('%s: previous vector (%j) clock is not contained in store, bailing out.', this._id, previousClock)
        return false
      }

      const nextClock = vectorclock.merge(await this.getLatestClock(), vectorclock.increment(previousClock, author))
      debug('%s: next clock is', this._id, nextClock)

      if (await this._contains(nextClock)) {
        debug('%s: next clock (%j) is already contained in store, bailing out.', this._id, nextClock)
        return false
      }

      const seq = this._seq = this._seq + 1
      const deltaKey = '/d:' + leftpad(seq.toString(16), 20)

      const deltaRecord = [previousClock, author, delta]

      debug('%s: saving delta %j = %j', this._id, deltaKey, deltaRecord)

      const newState = this._shared.apply(delta)

      await Promise.all([
        this._save(deltaKey, deltaRecord),
        this._save('/state', newState),
        this._save('/clock', nextClock),
        this._save('/seq', seq)
      ].filter(Boolean))

      debug('%s: saved delta and vector clock', this._id)
      this.emit('delta', delta, nextClock)
      this.emit('clock changed', nextClock)
      this.emit('state changed', newState)
      debug('%s: emitted state changed event', this._id)
      return nextClock
    })
  }

  saveState ([clock, state]) {
    debug('%s: save state', this._id, [clock, state])
    // TODO: include parent vector clock
    // to be able to decide whether to ignore this state or not
    return this._queue.add(async () => {
      const latest = await this.getLatestClock()
      debug('%s: latest vector clock:', this._id, latest)
      if (!clock) {
        const id = (await this._ipfs.id()).id
        clock = vectorclock.increment(latest, id)
        debug('%s: new vector clock is:', this._id, clock)
      } else {
        if (await this._contains(clock)) {
          // we have already seen this state change, so discard it
          return
        }
        clock = vectorclock.merge(latest, clock)
      }

      const newState = this._shared.apply(state)

      debug('%s: new merged state is %j', this._id, newState)

      await Promise.all([
        this._save('/state', state),
        this._save('/clock', clock)])

      debug('%s: saved state and vector clock', this._id)
      this.emit('clock changed', clock)
      this.emit('state changed', newState)
      debug('%s: emitted state changed event', this._id)
      return clock
    })
  }

  async getState () {
    return this._get('/state')
  }

  deltaStream (since) {
    debug('%s: delta stream since %j', this._id, since)
    return pull(
      this._store.query({
        prefix: '/d:'
      }),
      pull.map((d) => decode(d.value)),
      pull.map((d) => {
        debug('%s: delta stream candidate: %j', this._id, d)
        return d
      }),
      pull.asyncMap(([previousClock, author, delta], callback) => {
        const clock = vectorclock.increment(previousClock, author)
        if (vectorclock.compare(clock, since) < 0) {
          debug('%s: candidate rejected because of clock: %j', this._id, clock)
          return callback(null, null)
        }
        debug('%s: delta stream entry: %j', this._id, delta)
        since = clock
        callback(null, [previousClock, author, delta])
      }),
      pull.filter(Boolean) // only allow non-null values
    )
  }

  contains (clock) {
    return this._queue.add(() => this._contains(clock))
  }

  async _contains (clock) {
    const currentClock = await this.getLatestClock()
    const result = (vectorclock.isIdentical(clock, currentClock) ||
      vectorclock.compare(clock, currentClock) < 0)
    debug('%s: (%j) contains (%j)? : ', this._id, currentClock, clock, result)
    return result
  }

  _save (key, value) {
    return new Promise((resolve, reject) => {
      this._store.put(key, Buffer.from(JSON.stringify(value || null)), (err) => {
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

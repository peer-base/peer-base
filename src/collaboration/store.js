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
const encode = require('../common/encode')

module.exports = class CollaborationStore extends EventEmitter {
  constructor (ipfs, collaboration, options) {
    super()
    this._ipfs = ipfs
    this._collaboration = collaboration
    this._options = options

    this._cipher = options.createCipher
    if (typeof this._cipher !== 'function') {
      throw new Error('need options.createCipher')
    }

    this._queue = new Queue({ concurrency: 1 })

    this._shareds = []
  }

  async start () {
    this._store = await datastore(this._ipfs, this._collaboration)
    this._seq = await this.getSequence()
    this._id = (await this._ipfs.id()).id
  }

  setShared (shared) {
    this._shareds.push(shared)
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
      this._store.get(key, this._parsingResult((err, value) => {
        if (err) {
          return reject(err)
        }
        resolve(value)
      }))
    })
  }

  getClockAndStates () {
    return Promise.all(
      [this.getLatestClock(), this.getStates()])
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

      const newStateAndName = (await Promise.all(
        this._shareds.map((shared) => shared.apply(nextClock, delta)))).filter(Boolean)[0]

      const [name, newState] = newStateAndName || []

      const tasks = [
        this._save(deltaKey, deltaRecord),
        this._save('/clock', nextClock),
        this._save('/seq', seq)
      ]

      if (newStateAndName) {
        tasks.push(this._saveStateName(name))
        tasks.push(this._save('/state/' + name, newState))
      }

      debug('%s: new state is', this._id, newState)

      await Promise.all(tasks)

      this._scheduleDeltaTrim()

      debug('%s: saved delta and vector clock', this._id)
      this.emit('delta', delta, nextClock)
      this.emit('clock changed', nextClock)
      this.emit('state changed', newState, nextClock)
      debug('%s: emitted state changed event', this._id)
      return nextClock
    })
  }

  async saveStates ([clock, states]) {
    debug('%s: saveStates', this._id, clock, states)
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

      for (let state of states.values()) {
        await this._saveState(clock, state)
      }

      return clock
    })
  }

  async _saveState (clock, state) {
    if (!Buffer.isBuffer(state)) {
      throw new Error('state should be a buffer: ' + JSON.stringify(state))
    }

    debug('%s: save state', this._id, clock, state)
    // TODO: include parent vector clock
    // to be able to decide whether to ignore this state or not

    const newStateAndName = (await Promise.all(
      this._shareds.map((shared) => shared.apply(clock, state))))[0]

    if (!newStateAndName) {
      return
    }

    const [name, newState] = newStateAndName

    debug('%s: new merged state is %j', this._id, newState)

    await Promise.all([
      this._saveStateName(name),
      this._save('/state/' + name, newState),
      this._save('/clock', clock)])

    debug('%s: saved state and vector clock', this._id)
    this.emit('clock changed', clock)
    this.emit('state changed', newState)
    debug('%s: emitted state changed event', this._id)
    return clock
  }

  async getState (name) {
    if (!name) {
      name = null
    }
    return this._get('/state/' + name)
  }

  async getStates () {
    const stateNames = Array.from(await this._get('/stateNames') || new Set())
    const states = await Promise.all(stateNames.map((stateName) => this._get('/state/' + stateName)))
    return stateNames.reduce((acc, name, index) => {
      acc.set(name, states[index])
      return acc
    }, new Map())
  }

  deltaStream (_since = {}) {
    let since = Object.assign({}, _since)
    debug('%s: delta stream since %j', this._id, since)
    return pull(
      this._store.query({
        prefix: '/d:'
      }),
      pull.asyncMap(({value}, cb) => this._decode(value, cb)),
      pull.map((d) => {
        debug('%s: delta stream candidate: %j', this._id, d)
        return d
      }),
      pull.asyncMap((entireDelta, callback) => {
        const [previousClock, author, delta] = entireDelta
        const thisDeltaClock = vectorclock.increment(previousClock, author)
        if (!vectorclock.isFirstDirectChildOfSecond(thisDeltaClock, since)) {
          debug('%s: candidate rejected because of clock: %j', this._id, previousClock)
          return callback(null, null)
        }
        since = vectorclock.merge(since, thisDeltaClock)
        callback(null, entireDelta)
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
    return this._encode(value || null)
      .then((encoded) => this._saveEncoded(key, encoded))
  }

  async _saveStateName (name) {
    const stateNames = await this._get('/stateNames') || new Set()
    if (!stateNames.has(name)) {
      stateNames.add(name)
      await this._save('/stateNames', stateNames)
    }
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

  _scheduleDeltaTrim () {
    if (this._deltaTrimTimeout) {
      clearTimeout(this._deltaTrimTimeout)
    }
    this._deltaTrimTimeout = setTimeout(() => {
      this._deltaTrimTimeout = null
      if (this._trimmingDeltas) {
        return
      }
      this._trimDeltas()
    }, this._options.deltaTrimTimeoutMS)
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
          const thisSeq = Number(key.toString().substring(3))
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

  _encode (value) {
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

  _decode (bytes, callback) {
    this._cipher().then((cipher) => {
      cipher.decrypt(bytes, (err, decrypted) => {
        if (err) {
          return callback(err)
        }
        const decoded = decode(decrypted)
        callback(null, decoded)
      })
    }).catch(callback)
  }

  _parsingResult (callback) {
    return (err, result) => {
      if (err) {
        if (isNotFoundError(err)) {
          return callback(null, undefined)
        }
        return callback(err)
      }
      this._decode(result, callback)
    }
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

function isNotFoundError (err) {
  return (err.message.indexOf('Key not found') >= 0 || err.message.indexOf('No value') >= 0)
}

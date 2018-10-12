'use strict'

const debug = require('debug')('peer-star:persister:collab')
const dbgq = (...args) => debug('Process queue: ' + args.shift(), ...args)
const EventEmitter = require('events')
const Queue = require('p-queue')
const vectorclock = require('../common/vectorclock')
const Naming = require('./naming')
const OpQueue = require('./op-queue')
const Persistence = require('./persistence')
const PersistenceHeuristic = require('./persistence-heuristic')
const { encode, decode } = require('delta-crdts-msgpack-codec')

const defaultOptions = {
  // How long to wait before retrying if there's an error
  retryInterval: 10000
}

class CollaborationPersister extends EventEmitter {
  constructor (ipfs, name, type, store, options) {
    super()
    this._name = name
    this._type = type
    this._store = store
    this._options = Object.assign({}, defaultOptions, options)

    // Queue of operations
    this._opQueue = new OpQueue()
    // Queue for processing operations
    this._processQueue = new Queue({ concurrency: 1 })

    // Number of deltas that have been added on top of the last snapshot
    this._branchDeltaCount = 0

    this._onDelta = this._onDelta.bind(this)
    this._onSnapshot = this._onSnapshot.bind(this)

    this._naming = this._options.naming || new Naming(name, ipfs, this._options)
    this._publishQueue = new Queue({ concurrency: 1 })

    this._persistence = this._options.persistence || new Persistence(ipfs, this._options)
    this._persistenceHeuristic = this._options.persistenceHeuristic || new PersistenceHeuristic(this, this._options.persistenceHeuristicOptions)
    this._persistenceHeuristic.on('snapshot', this._onSnapshot)
  }

  // Get the last saved state from persistence
  // This should be called and the snapshot joined
  // with current state before starting the persister
  async fetchLatestState () {
    await this._startPersistenceAndNaming()

    let cid = await this._naming.fetch()
    if (!cid) return undefined

    // commit: {
    //   parentCid: <cid>,
    //   clock: <clock>,
    //   record: encode([
    //     'collab name',
    //     'crdt type',
    //     encrypt(encode(<state>))
    //   ])
    // }

    let commit
    const deltaClocks = []
    while (cid) {
      commit = await this._persistence.fetch(cid)
      // debug('cid', cid.toBaseEncodedString(), 'commit:', commit)
      const { parent, clock, record: encodedRec } = commit
      const isBuffer = encodedRec instanceof Buffer
      if (isBuffer) {
        const rec = decode(encodedRec)
        const encryptedState = rec[2]
        // debug('rec', rec)
        const encodedState = await this._options.decryptAndVerify(encryptedState)
        const state = decode(encodedState)
        // debug('plaintext', [name, type, state])
        deltaClocks.unshift({ clock, state })
      }
      cid = parent
    }

    // debug('all delta clocks', deltaClocks)
    const deltas = deltaClocks.map(d => d.state)
    const joined = joinDeltas(this._type, deltas)
    // debug('joined deltas', joined)

    const clocks = deltaClocks.map(d => d.clock)
    const merged = clocks.reduce((C, c) => vectorclock.merge(C, c), {})
    // debug('joined clocks', merged)

    const encryptedState = await this._options.signAndEncrypt(encode(joined))
    const rec = [this._name, this._type.typeName, encryptedState]
    return { clock: merged, state: encode(rec) }
  }

  // waitForPublish indicates whether to wait for the snapshot that is created
  // on startup to be published to the naming service
  start (waitForPublish) {
    if (!this._starting) {
      this._starting = this._start(waitForPublish)
    }
    return this._starting
  }

  async _start (waitForPublish) {
    await this._startPersistenceAndNaming()

    // First we want to save a snapshot
    this._opQueue.pushHeadSnapshot()

    // Start listening for snapshot events and deltas
    this._persistenceHeuristic.start()
    this._store.on('delta', this._onDelta)

    // Wait for the first snapshot to be persisted
    await Promise.all([
      this._triggerProcessQueue(),
      // If the caller wants to we wait until the snapshot has actually
      // been published before returning
      waitForPublish && new Promise(resolve => this.once('publish', resolve))
    ])
  }

  _startPersistenceAndNaming () {
    if (this._persistenceAndNamingStarting) return

    this._persistenceAndNamingStarting = true
    return Promise.all([
      this._persistence.start(),
      this._naming.start()
    ])
  }

  async stop () {
    this._store.removeListener('delta', this._onDelta)
    this._persistenceHeuristic.stop()
    this._publishQueue.clear()
    this._processQueue.clear()
    await Promise.all([
      this._publishQueue.onIdle(),
      this._processQueue.onIdle()
    ])
    await Promise.all([
      this._persistence.stop(),
      this._naming.stop()
    ])
  }

  _onDelta (delta, clock) {
    debug('Delta received')
    this._opQueue.pushTailDelta(clock, delta)
    debug('New op queue:', this._opQueue.ops())
    this._triggerProcessQueue()
  }

  _onSnapshot () {
    debug('Snapshot requested')

    // A snapshot event has been fired.
    const front = this._opQueue.peekHead()

    // If the operations queue already has a snapshot at the front of it, then
    // we don't need to do anything.
    if (front && front.type === 'SNAPSHOT') {
      debug('Ignoring request - already have snapshot at op queue head')
      return
    }

    // If the operations queue has a delta at the front of it, the delta is
    // already being processed. We want to make sure that the delta is also
    // included in this new snapshot, so duplicate the delta, then add the
    // snapshot to the front of the operations queue.
    if (front && front.type === 'DELTA') {
      debug('Duplicating delta at op queue head')
      this._opQueue.dupHead()
    }
    this._opQueue.pushHeadSnapshot()
    debug('New op queue', this._opQueue.ops())
    this._triggerProcessQueue()
  }

  _triggerProcessQueue () {
    return this._processQueue.add(() => this._processOpQueue())
  }

  async _processOpQueue () {
    dbgq('Queue(%d):', this._opQueue.length(), this._opQueue.ops())

    // There are no operations in the queue
    const op = this._opQueue.peekHead()
    if (!op) {
      dbgq('Done - No operations in queue')
      return
    }

    dbgq('Processing %s', op.type)

    try {
      if (op.type === 'SNAPSHOT') {
        await this._processSnapshot()
        this._opQueue.remove(op.id)
        this._triggerProcessQueue()
        return
      }

      const processed = await this._processDelta(op.data)
      if (processed) {
        this._opQueue.remove(op.id)
        this._triggerProcessQueue()
      }
    } catch (e) {
      this.emit('error', e)
      dbgq('Caught error', e)
      setTimeout(() => this._triggerProcessQueue(), this._options.retryInterval)
    }
  }

  async _processDelta (delta) {
    // We don't have a snapshot to append to yet
    if (!this._lastSnapshot) {
      dbgq('Done - No snapshot: delta processing blocked')
      return false
    }

    // The delta is already contained by the last snapshot
    if (vectorclock.doesSecondHaveFirst(delta.clock, this._lastSnapshot.clock)) {
      dbgq('Done - delta clock %j already contained by latest snapshot %j',
        delta.clock, this._lastSnapshot.clock)
      return true
    }

    // Commit the delta to persistent storage
    const cid = await this._persistence.save(this._parentCid, delta.clock, delta.delta)
    dbgq('Done - Saved delta with clock %j to persistent storage. CID: %j Parent: %j',
      delta.clock, cid.toBaseEncodedString(), this._parentCid.toBaseEncodedString())

    this._parentCid = cid
    this._branchDeltaCount++
    this.emit('branch delta count', this._branchDeltaCount, cid)

    // Update the name to point to the new HEAD state
    // (note that we don't wait for this to finish)
    this._enqueueHeadUpdate(cid)
    return true
  }

  async _processSnapshot () {
    // Get the latest snapshot from the store
    let [clock, state] = await this._store.getClockAndState(this._name)

    // If the store state is the same as the latest snapshot, no need to save it
    dbgq('Comparing latest clock from store %j to last snapshot clock %j', clock, (this._lastSnapshot || {}).clock)
    if (this._lastSnapshot && vectorclock.isIdentical(this._lastSnapshot.clock, clock)) {
      dbgq('Done - Clocks are identical')
      return
    }

    // Save the snapshot
    state = state || null
    this._parentCid = await this._persistence.save(null, clock, state)
    dbgq('Done - Saved snapshot %j to persistence. CID:', clock, this._parentCid.toBaseEncodedString())

    // Update the name to point to the new HEAD state
    // (note that we don't wait for this to finish)
    this._enqueueHeadUpdate(this._parentCid)

    // Save a copy of the snapshot and reset the count of deltas on top of
    // the snapshot
    this._lastSnapshot = { clock, state }
    this._branchDeltaCount = 0
  }

  _enqueueHeadUpdate (cid) {
    // We only want to save the latest HEAD so clear any previous publish
    // events in the queue
    this._publishQueue.clear()
    return this._publishQueue.add(async () => {
      await this._naming.update(cid)
      debug('Updated HEAD to CID: %s', cid.toBaseEncodedString())
      this.emit('publish', cid)
    })
  }
}

// TODO: shared code
class VoidChangeEmitter {
  changed (event) {}
  emitAll () {}
}

const voidChangeEmitter = new VoidChangeEmitter()
function joinDeltas (crdtType, deltas) {
  return deltas.reduce(
    (D, d) => crdtType.join.call(voidChangeEmitter, D, d),
    crdtType.initial())
}

module.exports = (ipfs, collabName, type, store, options) => {
  return new CollaborationPersister(ipfs, collabName, type, store, options)
}

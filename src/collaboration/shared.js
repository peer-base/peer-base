/* eslint no-console: "off" */
'use strict'

const assert = require('assert')
const debug = require('debug')('peer-base:collaboration:shared')
const EventEmitter = require('events')
const b58Decode = require('bs58').decode
const vectorclock = require('../common/vectorclock')
const Store = require('./store')
const peerToClockId = require('./peer-to-clock-id')

const MAX_LISTENERS = 100

module.exports = (name, id, crdtType, ipfs, collaboration, clocks, options) => {
  const shared = new EventEmitter()
  shared.setMaxListeners(MAX_LISTENERS)
  const changeEmitter = new ChangeEmitter(shared)
  const voidChangeEmitter = new VoidChangeEmitter()

  const store = new Store(ipfs, collaboration, options)

  let deltas = []
  let state = crdtType.initial()
  const memo = {}
  let valueCache

  const pushDelta = (delta) => {
    deltas.push(delta)
    if (deltas.length > options.maxDeltaRetention) {
      deltas.splice(0, deltas.length - options.maxDeltaRetention)
    }
  }

  const clockId = peerToClockId(id)

  const applyAndPushDelta = (delta) => {
    if (collaboration.isRoot()) {
      const previousClock = clocks.getFor(id)
      apply(delta, true)
      const newClock = vectorclock.increment(previousClock, clockId)
      const authorClock = vectorclock.increment({}, clockId)
      const deltaRecord = [previousClock, authorClock, [name, crdtType.typeName, delta]]
      pushDelta(deltaRecord)
      onClockChanged(newClock)
    } else {
      collaboration.parent.shared.pushDeltaForSub(name, crdtType.typeName, delta)
      apply(delta, true)
    }
  }

  const crdtId = (() => {
    const crdtIdBuffer = b58Decode(id)
    return crdtIdBuffer.slice(crdtIdBuffer.length - 4)
  })()

  // shared mutators
  Object.keys(crdtType.mutators).forEach((mutatorName) => {
    const mutator = crdtType.mutators[mutatorName]
    shared[mutatorName] = async (...args) => {
      const delta = mutator(crdtId, state, ...args)
      return applyAndPushDelta(delta)
    }
  })

  shared.start = async () => {
    await store.start()
    const [loadedState, loadedDeltas, clock] = await store.load()
    if (loadedState) {
      if (crdtType.incrementalValue && !options.replicateOnly) {
        assert(!valueCache)
        valueCache = crdtType.incrementalValue(state, loadedState, loadedState)
      }
      state = loadedState
    } else if (crdtType.incrementalValue && !options.replicateOnly) {
      assert(!valueCache)
      valueCache = crdtType.incrementalValue(state, state, state)
    }
    if (loadedDeltas) {
      deltas = loadedDeltas
    }
    if (clock) {
      clocks.mergeFor(id, clock)
    }
  }

  shared.stop = () => {
    return store.stop()
  }

  shared.name = name

  shared.state = () => state

  shared.stateAsDelta = () => {
    return [{}, clocks.getFor(id), [name, crdtType.typeName, state]]
  }

  // shared value
  shared.value = () => {
    if (valueCache !== undefined) {
      let retValue = valueCache.value
      if (retValue.toJS) {
        retValue = retValue.toJS()
      }
      return retValue
    }
    if ((!memo.state) || (memo.state !== state)) {
      memo.state = state
      memo.value = crdtType.value(state)
    }
    return memo.value
  }

  shared.pushDeltaForSub = (name, type, delta) => {
    const previousClock = clocks.getFor(id)
    const newClock = vectorclock.increment(previousClock, clockId)
    const authorClock = vectorclock.increment({}, clockId)
    const deltaRecord = [previousClock, authorClock, [name, type, delta]]
    pushDelta(deltaRecord)
    onClockChanged(newClock)
  }

  shared.apply = (deltaRecord, isPartial, force) => {
    const clock = clocks.getFor(id)
    const [previousClock, authorClock, [forName, typeName, delta]] = deltaRecord
    const deltaClock = vectorclock.sumAll(previousClock, authorClock)
    const newClock = options.replicateOnly ? deltaClock : vectorclock.merge(clock, deltaClock)
    if (forName === name) {
      let isInteresting = vectorclock.isDeltaInteresting(deltaRecord, clock)
      if (!isInteresting && force) {
        isInteresting = vectorclock.isIdentical(clock, newClock)
      }
      if (!isInteresting) {
        return false
      }

      if (options.replicateOnly && Object.keys(previousClock).length) {
        // if this is a pinner, do not accept partial deltas, only full states
        return false
      }
    }
    if (collaboration.isRoot()) {
      pushDelta(deltaRecord)
    }
    if (forName === name) {
      apply(delta)
      onClockChanged(newClock)
      return newClock
    } else if (typeName) {
      return collaboration.sub(forName, typeName)
        .then((subCollaboration) => {
          return subCollaboration.shared.apply(deltaRecord, isPartial, force)
        })
    }
  }

  shared.initial = () => Promise.resolve(new Map())

  shared.clock = () => clocks.getFor(id)

  shared.contains = (otherClock) => {
    const clock = clocks.getFor(id)
    return (vectorclock.compare(otherClock, clock) < 0) || vectorclock.isIdentical(otherClock, clock)
  }

  shared.deltas = (since = {}, targetPeerId) => {
    return deltas.filter((deltaRecord) => {
      if (vectorclock.isDeltaInteresting(deltaRecord, since, targetPeerId)) {
        const [previousClock, authorClock] = deltaRecord
        since = vectorclock.merge(since, vectorclock.sumAll(previousClock, authorClock))
        return true
      }
      return false
    })
  }

  shared.deltaBatches = (since = {}, targetPeerId) => {
    const targetClockId = peerToClockId(targetPeerId)
    const deltas = shared.deltas(since, targetPeerId)

    const batches = []
    let currentBatch = {
      previousClock: since,
      authorClock: {},
      name,
      type: crdtType.typeName,
      deltas: []
    }
    for (const deltaRecord of deltas) {
      if (!vectorclock.isDeltaInteresting(deltaRecord, since, targetClockId)) {
        continue
      }
      const oldClock = vectorclock.sumAll(
        currentBatch.previousClock, currentBatch.authorClock)
      const [
        deltaPreviousClock,
        deltaAuthorClock,
        [deltaName, deltaType,]
      ] = deltaRecord
      const deltaClock = vectorclock.sumAll(deltaPreviousClock, deltaAuthorClock)

      if (
        deltaName !== currentBatch.name ||
        deltaType !== currentBatch.type ||
        deltaType !== 'rga'
      ) {
        // could not perform join. will resort to creating a new batch for this delta.
        emitBatch()
        currentBatch = {
          previousClock: deltaPreviousClock,
          authorClock: deltaAuthorClock,
          name: deltaName,
          type: deltaType,
          deltas: [ deltaRecord ]
        }
        since = vectorclock.merge(since, deltaClock)
        continue
      }

      // we only know how to combine rga deltas currently
      const newClock = vectorclock.merge(oldClock, deltaClock)
      since = vectorclock.merge(since, newClock)
      currentBatch.previousClock = vectorclock.minimum(
        currentBatch.previousClock, deltaPreviousClock)
      currentBatch.authorClock = vectorclock.subtract(
        currentBatch.previousClock, newClock)
      currentBatch.deltas.push(deltaRecord)
    }
    emitBatch()
    return batches

    function emitBatch () {
      if (currentBatch.deltas.length > 0) {
        // Build delta batch
        const {
          previousClock,
          authorClock,
          name: forName,
          type,
          deltas
        } = currentBatch
        let delta
        if (type === 'rga') {
          // For rga, we can build an 'intersection' of the deltas we want to
          // send in the batch with the full state we have
          let baseState
          if (forName === name) {
            baseState = state
          } else {
            const sub = collaboration._subs.get(forName)
            baseState = sub.shared.state()
          }
          delta = intersectRga(baseState, deltas)
        } else {
          assert(deltas.length === 1)
          delta = deltas[0]
        }
        batches.push([previousClock, authorClock, [name, type, delta]])
      }
      currentBatch = undefined
    }

    // this probably belongs in delta-crdts
    function intersectRga (state, deltas) {
      const vertexes = new Set()
      for (const [, , [, , delta]] of deltas) {
        const edges = delta[2]
        for (const [left, right] of edges) {
          vertexes.add(left)
          vertexes.add(right)
        }
      }
      const added = new Map(
        [...state[0].entries()].filter(([key,]) => vertexes.has(key))
      )
      const deleted = new Set(
        [...state[1].values()].filter((key => vertexes.has(key)))
      )
      const edges = new Map()
      let key = null
      let lastRight = null
      let previousAdded = false
      do {
        const left = key
        const right = state[2].get(key)
        if (vertexes.has(left) && vertexes.has(right)) {
          if (!previousAdded && lastRight !== left) {
            edges.set(lastRight, left)
          }
          edges.set(left, right)
          previousAdded = true
          lastRight = right
        } else {
          previousAdded = false
        }
        key = right
      } while (key)
      return [ added, deleted, edges ]
    }
  }

  shared.save = () => {
    const clock = clocks.getFor(id)
    return store.save(state, deltas, clock).then((result) => {
      shared.emit('saved')
      return result
    })
  }

  return shared

  function apply (s, fromSelf) {
    debug('%s: apply ', id, s)
    if (options.replicateOnly) {
      state = s
    } else {
      const newState = crdtType.join.call(changeEmitter, state, s, { strict: true })
      if (crdtType.incrementalValue) {
        assert(valueCache)
        valueCache = crdtType.incrementalValue(state, newState, s, valueCache)
      }
      state = newState
      shared.emit('delta', s, fromSelf)

      debug('%s: new state after join is', id, state)
      try {
        changeEmitter.emitAll()
      } catch (err) {
        console.error('Error caught while emitting changes:', err)
      }
    }

    shared.emit('state changed', fromSelf)
    return state
  }

  function onClockChanged (newClock) {
    newClock = clocks.mergeFor(id, newClock)
    shared.emit('clock changed', newClock)
  }
}

class ChangeEmitter {
  constructor (client) {
    this._client = client
    this._events = []
  }

  changed (event) {
    this._events.push(event)
  }

  emitAll () {
    const events = this._events
    this._events = []
    events.forEach((event) => {
      this._client.emit('change', event)
    })
  }
}

class VoidChangeEmitter {
  changed (event) {
    // DO NOTHING
  }

  emitAll () {
    // DO NOTHING
  }
}

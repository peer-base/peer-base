/* eslint no-console: "off" */
'use strict'

const assert = require('assert')
const debug = require('debug')('peer-base:collaboration:shared')
const EventEmitter = require('events')
const b58Decode = require('bs58').decode
const radix64 = require('radix-64')()
const vectorclock = require('../common/vectorclock')
const Store = require('./store')

module.exports = (name, id, crdtType, ipfs, collaboration, clocks, options) => {
  const shared = new EventEmitter()
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

  // Decoding the id results in a 34 byte buffer, so cut it down to the last
  // 8 bytes, then radix64 encode to fit it efficiently into a string
  const clockId = (() => {
    const buff = b58Decode(id)
    return radix64.encodeBuffer(buff.slice(buff.length - 8))
  })()

  const applyAndPushDelta = (delta) => {
    if (collaboration.isRoot()) {
      const previousClock = clocks.getFor(id)
      apply(delta, true)
      const newClock = vectorclock.increment(previousClock, clockId)
      const authorClock = vectorclock.increment({}, clockId)
      const deltaRecord = [previousClock, authorClock, [name, crdtType.typeName, delta]]
      pushDelta(deltaRecord)
      shared.emit('clock changed', newClock)
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
      clocks.setFor(id, clock)
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
    shared.emit('clock changed', newClock)
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
      shared.emit('clock changed', newClock)
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

  shared.deltas = (since = {}) => {
    const interestingDeltas = deltas.filter((deltaRecord) => {
      if (vectorclock.isDeltaInteresting(deltaRecord, since)) {
        const [previousClock, authorClock] = deltaRecord
        since = vectorclock.merge(since, vectorclock.sumAll(previousClock, authorClock))
        return true
      }
      return false
    })

    return interestingDeltas
  }

  shared.deltaBatch = (_since = {}) => {
    let since = _since
    const deltas = shared.deltas(since)
    if (!deltas.length) {
      return [since, {}, [name, crdtType.typeName, crdtType.initial()]]
    }

    const batch = deltas
      .reduce((acc, deltaRecord) => {
        if (vectorclock.isDeltaInteresting(deltaRecord, since)) {
          const [oldPreviousClock, oldAuthorClock, [, , oldDelta]] = acc
          const oldClock = vectorclock.sumAll(oldPreviousClock, oldAuthorClock)
          const [deltaPreviousClock, deltaAuthorClock, [, , delta]] = deltaRecord
          const deltaClock = vectorclock.sumAll(deltaPreviousClock, deltaAuthorClock)
          const newClock = vectorclock.merge(oldPreviousClock, deltaClock)
          const newPreviousClock = vectorclock.minimum(oldPreviousClock, deltaPreviousClock)
          const newAuthorClock = vectorclock.subtract(newPreviousClock, newClock)
          since = vectorclock.merge(since, newClock)
          const newDelta = crdtType.join.call(voidChangeEmitter, oldDelta, delta)
          return [newPreviousClock, newAuthorClock, [name, crdtType.typeName, newDelta]]
        }
        return acc
      })
    return batch
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
      const newState = crdtType.join.call(changeEmitter, state, s)
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

/* eslint no-console: "off" */
'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')
const b58Decode = require('bs58').decode
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

  const pushDelta = (delta) => {
    deltas.push(delta)
    if (deltas.length > options.maxDeltaRetention) {
      deltas.splice(0, deltas.length - options.maxDeltaRetention)
    }
  }

  const applyAndPushDelta = (delta) => {
    if (collaboration.isRoot()) {
      const previousClock = clocks.getFor(id)
      apply(delta, true)
      const newClock = vectorclock.increment(previousClock, id)
      const author = {}
      author[id] = 1
      const deltaRecord = [previousClock, author, [name, crdtType.typeName, delta]]
      pushDelta(deltaRecord)
      shared.emit('clock changed', newClock)
    } else {
      collaboration.parent.shared.pushDeltaForSub(name, crdtType.typeName, delta)
      apply(delta)
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
      state = loadedState
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
    if ((!memo.state) || (memo.state !== state)) {
      memo.state = state
      memo.value = crdtType.value(state)
    }
    return memo.value
  }

  shared.pushDeltaForSub = (name, type, delta) => {
    const previousClock = clocks.getFor(id)
    const newClock = vectorclock.increment(previousClock, id)
    const author = {}
    author[id] = 1
    const deltaRecord = [previousClock, author, [name, type, delta]]
    pushDelta(deltaRecord)
    shared.emit('clock changed', newClock)
  }

  shared.apply = (deltaRecord, isPartial, force) => {
    const clock = clocks.getFor(id)
    const [previousClock, authorClock, [forName, typeName, delta]] = deltaRecord
    if ((forName === name) && !force && !vectorclock.isDeltaInteresting(deltaRecord, clock)) {
      return false
    }
    if (collaboration.isRoot()) {
      pushDelta(deltaRecord)
    }
    if (forName === name) {
      apply(delta)
      const newClock = vectorclock.merge(clock, vectorclock.sumAll(previousClock, authorClock))
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

  shared.deltaBatch = (since = {}) => {
    const deltas = shared.deltas(since)
    if (!deltas.length) {
      return [since, {}, [name, crdtType.typeName, crdtType.initial()]]
    }

    const batch = deltas
      .reduce((acc, newDeltaRecord) => {
        const [oldPreviousClock, oldAuthorClock, [, , state]] = acc
        const oldClock = vectorclock.sumAll(oldPreviousClock, oldAuthorClock)
        const [newPreviousClock, newAuthorClock, [, , newDelta]] = newDeltaRecord
        const newClock = vectorclock.sumAll(newPreviousClock, newAuthorClock)
        const nextClock = vectorclock.merge(oldClock, newClock)

        const minimumPreviousClock = vectorclock.minimum(oldPreviousClock, newPreviousClock)
        const nextAuthorClock = vectorclock.subtract(minimumPreviousClock, nextClock)

        const newState = crdtType.join.call(voidChangeEmitter, state, newDelta)
        return [minimumPreviousClock, nextAuthorClock, [name, crdtType.typeName, newState]]
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
      state = crdtType.join.call(changeEmitter, state, s)
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

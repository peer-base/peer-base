'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')
const b58Decode = require('bs58').decode
const vectorclock = require('../common/vectorclock')

module.exports = (name, id, crdtType, collaboration, clocks, options) => {
  const shared = new EventEmitter()
  const changeEmitter = new ChangeEmitter(shared)
  const voidChangeEmitter = new VoidChangeEmitter()
  let deltas = []
  let state = crdtType.initial()
  const memo = {}

  const applyAndPushDelta = (delta) => {
    const previousClock = clocks.getFor(id)
    apply(delta, true)
    const newClock = vectorclock.increment(previousClock, id)
    const author = {}
    author[id] = 1
    const deltaRecord = [previousClock, author, [name, crdtType.typeName, delta]]
    deltas.push(deltaRecord)
    shared.emit('clock changed', newClock)
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

  shared.apply = (deltaRecord, isPartial) => {
    const clock = clocks.getFor(id)
    if (!vectorclock.isDeltaInteresting(deltaRecord, clock)) {
      return false
    }
    // console.log(deltaRecord)
    const [previousClock, authorClock, [forName, typeName, delta]] = deltaRecord
    if (forName === name) {
      deltas.push(deltaRecord)
      apply(delta)
      const newClock = vectorclock.merge(clock, vectorclock.sumAll(previousClock, authorClock))
      shared.emit('clock changed', newClock)
      return newClock
    } else if (typeName) {
      throw new Error('sub collaborations not yet supported!')
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
        // console.log('~~~~~ since', since)
        const [oldPreviousClock, oldAuthorClock, [, , state]] = acc
        // console.log([oldPreviousClock, oldAuthorClock])
        const oldClock = vectorclock.sumAll(oldPreviousClock, oldAuthorClock)
        const [newPreviousClock, newAuthorClock, [, , newDelta]] = newDeltaRecord
        const newClock = vectorclock.sumAll(newPreviousClock, newAuthorClock)
        const nextClock = vectorclock.merge(oldClock, newClock)

        // console.log('new since is', since)

        // console.log('new delta:', newDelta)
        const minimumPreviousClock = vectorclock.minimum(oldPreviousClock, newPreviousClock)
        const nextAuthorClock = vectorclock.subtract(minimumPreviousClock, nextClock)

        // console.log('previous clock', previousClock)
        // console.log('next author clock', nextAuthorClock)

        const newState = crdtType.join.call(voidChangeEmitter, state, newDelta)
        return [minimumPreviousClock, nextAuthorClock, [name, crdtType.typeName, newState]]
      })
    // console.log('~~~~~')
    return batch
  }

  shared.save = () => {
    // TODO
  }

  return shared

  function apply (s, fromSelf) {
    debug('%s: apply ', id, s)
    // console.log('%s: apply ', id, s)
    state = crdtType.join.call(changeEmitter, state, s)
    shared.emit('delta', s, fromSelf)

    debug('%s: new state after join is', id, state)
    try {
      changeEmitter.emitAll()
    } catch (err) {
      console.error('Error caught while emitting changes:', err)
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

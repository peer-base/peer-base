'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')
const b58Decode = require('bs58').decode
const vectorclock = require('../common/vectorclock')

module.exports = (name, id, crdtType, collaboration, options) => {
  const shared = new EventEmitter()
  const changeEmitter = new ChangeEmitter(shared)
  let clock = {}
  let deltas = []
  let state = crdtType.initial()
  const memo = {}

  const applyAndPushDelta = (delta) => {
    const previousClock = clock
    apply(delta, true)
    clock = vectorclock.increment(clock, id)
    const author = {}
    author[id] = 1
    const deltaRecord = [previousClock, author, [name, crdtType.typeName, delta]]
    deltas.push(deltaRecord)
    shared.emit('clock changed', clock)
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

  // shared value
  shared.value = () => {
    if ((!memo.state) || (memo.state !== state)) {
      memo.state = state
      memo.value = crdtType.value(state)
    }
    return memo.value
  }

  shared.apply = (deltaRecord, isPartial) => {
    if (!vectorclock.isDeltaInteresting(deltaRecord, clock)) {
      return false
    }
    const [previousClock, authorClock, [forName, typeName, delta]] = deltaRecord
    if (forName === name) {
      deltas.push(deltaRecord)
      apply(delta)
      clock = vectorclock.merge(clock, vectorclock.sumAll(previousClock, authorClock))
      shared.emit('clock changed', clock)
    } else if (typeName) {
      throw new Error('sub collaborations not yet supported!')
    }
  }

  shared.initial = () => Promise.resolve(new Map())

  shared.clock = () => clock

  shared.contains = (otherClock) => (vectorclock.compare(otherClock, clock) < 0) || vectorclock.isIdentical(otherClock, clock)

  shared.deltas = (since = {}) => {
    return deltas.filter((delta) => {
      if (vectorclock.isDeltaInteresting(delta, since)) {
        const [previousClock, authorClock] = delta
        since = vectorclock.merge(since, vectorclock.sumAll(previousClock, authorClock))
        return true
      }
      return false
    })
  }

  shared.save = () => {
    // TODO
  }

  return shared

  function apply (s, fromSelf) {
    debug('%s: apply ', id, s)
    console.log('%s: apply ', id, s)
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

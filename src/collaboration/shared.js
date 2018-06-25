'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')

module.exports = async (id, type, store) => {
  const shared = new EventEmitter()
  const crdt = type(id)
  let saving = 0
  let state = crdt.initial()

  // Populate shared methods

  // shared mutators
  Object.keys(crdt.mutators).forEach((mutatorName) => {
    const mutator = crdt.mutators[mutatorName]
    shared[mutatorName] = (...args) => {
      const delta = mutator(state, ...args)
      state = crdt.join(state, delta)
      debug('new state is', state)
      shared.emit('state changed')

      // save
      saving++
      store.saveDelta([null, null, delta], state)
        .then(() => {
          saving--
        })
        .catch((err) => {
          saving--
          shared.emit('error', err)
        })
    }
  })

  // shared value
  shared.value = () => crdt.value(state)

  // hook up store events to crdt
  const onStoreStateChanged = (newState) => {
    if (!saving) {
      state = crdt.join(state, newState)
      debug('new state after join is', state)
      shared.emit('state changed')
    }
  }
  store.on('state changed', onStoreStateChanged)

  const onStoreDelta = (delta, clock) => {
    if (!saving) {
      state = crdt.join(state, delta)
    }
  }
  store.on('delta', onStoreDelta)

  shared.apply = (s) => {
    if (!saving) {
      state = crdt.join(state, s)
    }
    return state
  }

  shared.stop = () => {
    store.removeListener('state changed', onStoreStateChanged)
    store.removeListener('delta', onStoreDelta)
  }

  const storeState = await store.getState()
  if (storeState !== undefined) {
    state = crdt.join(state, storeState)
  }

  return shared
}

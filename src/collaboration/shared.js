'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')
const Queue = require('p-queue')
const debounce = require('lodash/debounce')

const { encode, decode } = require('delta-crdts-msgpack-codec')
const vectorclock = require('../common/vectorclock')

module.exports = async (name, id, crdtType, collaboration, store, keys, _options) => {
  const options = Object.assign({}, _options)
  const queue = new Queue({ concurrency: 1 })
  const applyQueue = new Queue({ concurrency: 1 })
  const shared = new EventEmitter()
  let clock = {}
  let state = crdtType.initial()
  let deltaBuffer = []
  const memo = {}

  const saveDeltaBuffer = () => {
    queue.add(async () => {
      const deltas = deltaBuffer
      // reset the delta buffer
      deltaBuffer = []
      const jointDelta = deltas.reduce(
        (D, d) => crdtType.join.call(voidChangeEmitter, D, d),
        crdtType.initial())
      const namedDelta = [name, crdtType.typeName, await signAndEncrypt(encode(jointDelta))]
      debug('%s: named delta: ', id, namedDelta)
      // clock = vectorclock.increment(clock, id)
      // debug('%s: clock before save delta:', id, clock)
      // const newClock =
      const newClock = await store.saveDelta([null, null, encode(namedDelta)], true)
      if (newClock) {
        clock = vectorclock.merge(clock, newClock)
      }
      // if (newClock) {
      //   debug('%s: NEW clock after save delta:', id, newClock)
      //   clock = vectorclock.merge(clock, newClock)
      // }
    }).catch((err) => shared.emit('error', err))
  }

  // Change emitter
  const voidChangeEmitter = new VoidChangeEmitter()
  const changeEmitter = new ChangeEmitter(shared)

  // Populate shared methods

  // shared mutators
  Object.keys(crdtType.mutators).forEach((mutatorName) => {
    const mutator = crdtType.mutators[mutatorName]
    shared[mutatorName] = async (...args) => {
      const delta = mutator(id, state, ...args)
      apply(delta, true)
      deltaBuffer.push(delta)
      await saveDeltaBuffer()
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

  shared.apply = (remoteClock, encodedDelta, isPartial, fromSelf) => {
    debug('%s: apply', id, remoteClock, encodedDelta)
    if (!Buffer.isBuffer(encodedDelta)) {
      throw new Error('encoded delta should have been buffer')
    }
    return applyQueue.add(async () => {
      const [forName, typeName, encryptedState] = decode(encodedDelta)
      debug('%s: shared.apply %j', id, remoteClock, forName)
      if (forName === name) {
        if (vectorclock.compare(remoteClock, clock) >= 0) {
          clock = vectorclock.merge(clock, remoteClock)
          if (!fromSelf) {
            const encodedState = await decryptAndVerify(encryptedState)
            if (!options.replicateOnly) {
              const newState = decode(encodedState)
              apply(newState, fromSelf)
            } else if (!isPartial) {
              state = encodedState
            }
          } else {
            shared.emit('state changed', state)
          }
        }
        debug('%s state after apply:', id, state)
        const saveState = options.replicateOnly ? state : await signAndEncrypt(encode(state))
        return [name, encode([name, forName && crdtType.typeName, saveState])]
      } else if (typeName) {
        const sub = await collaboration.sub(forName, typeName)
        return sub.shared.apply(remoteClock, encodedDelta)
      }
    })
  }

  shared.stop = () => {
    // nothing to do here...
  }

  shared.initial = () => Promise.resolve(new Map())

  shared.signAndEncrypt = async (message) => {
    let encrypted
    if (!keys.public || keys.write) {
      encrypted = await signAndEncrypt(message)
    } else {
      encrypted = message
    }
    return encrypted
  }

  const encryptedStoreState = await store.getState(name)
  try {
    if (encryptedStoreState) {
      const [, , encryptedState] = decode(encryptedStoreState)
      const storeState = decode(await decryptAndVerify(encryptedState))
      if (keys && keys.read) {
        apply(storeState, true)
      } else {
        state = storeState
      }
    }
  } catch (err) {
    shared.emit('error', err)
  }

  return shared

  function apply (s, fromSelf) {
    debug('%s: apply ', id, s)
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

  function signAndEncrypt (data) {
    return new Promise((resolve, reject) => {
      if (!keys.write) {
        return resolve(data)
      }
      keys.write.sign(data, (err, signature) => {
        if (err) {
          return reject(err)
        }

        const toEncrypt = encode([data, signature])

        keys.cipher()
          .then((cipher) => {
            cipher.encrypt(toEncrypt, (err, encrypted) => {
              if (err) {
                return reject(err)
              }

              resolve(encrypted)
            })
          })
          .catch(reject)
      })
    })
  }

  function decryptAndVerify (encrypted) {
    return new Promise((resolve, reject) => {
      if (!keys.cipher && !keys.read) {
        return resolve(encrypted)
      }
      keys.cipher()
        .then((cipher) => cipher.decrypt(encrypted, (err, decrypted) => {
          if (err) {
            return reject(err)
          }
          const decoded = decode(decrypted)
          const [encoded, signature] = decoded

          keys.read.verify(encoded, signature, (err, valid) => {
            if (err) {
              return reject(err)
            }

            if (!valid) {
              return reject(new Error('delta has invalid signature'))
            }

            resolve(encoded)
          })
        }))
        .catch(reject)
    })
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
  changed (event) {}
  emitAll () {}
}

'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')
const Queue = require('p-queue')
const debounce = require('lodash.debounce')

const encode = require('../common/encode')
const decode = require('../common/decode')
const vectorclock = require('../common/vectorclock')

module.exports = async (name, id, type, collaboration, store, keys) => {
  const queue = new Queue({ concurrency: 1 })
  const applyQueue = new Queue({ concurrency: 1 })
  const shared = new EventEmitter()
  const crdt = type(id)
  let clock = {}
  let state = crdt.initial()
  let deltaBuffer = []
  // let clock = await store.getLatestClock()

  const saveDeltaBuffer = debounce(() => {
    queue.add(async () => {
      const deltas = deltaBuffer
      // reset the delta buffer
      deltaBuffer = []
      const jointDelta = deltas.reduce(
        (D, d) => crdt.join.call(voidChangeEmitter, D, d),
        crdt.initial())
      const namedDelta = [name, type.typeName, await signAndEncrypt(encode(jointDelta))]
      debug('%s: named delta: ', id, namedDelta)
      // clock = vectorclock.increment(clock, id)
      // debug('%s: clock before save delta:', id, clock)
      // const newClock =
      const newClock = await store.saveDelta([null, null, encode(namedDelta)])
      if (newClock) {
        clock = vectorclock.merge(clock, newClock)
      }
      // if (newClock) {
      //   debug('%s: NEW clock after save delta:', id, newClock)
      //   clock = vectorclock.merge(clock, newClock)
      // }
    }).catch((err) => shared.emit('error', err))
  }, 0)

  // Change emitter
  const voidChangeEmitter = new VoidChangeEmitter()
  const changeEmitter = new ChangeEmitter(shared)

  // Populate shared methods

  // shared mutators
  Object.keys(crdt.mutators).forEach((mutatorName) => {
    const mutator = crdt.mutators[mutatorName]
    shared[mutatorName] = (...args) => {
      const delta = mutator(state, ...args)
      apply(delta, true)
      deltaBuffer.push(delta)
      saveDeltaBuffer()
    }
  })

  shared.name = name

  shared.state = () => state

  // shared value
  shared.value = () => crdt.value(state)

  shared.apply = (remoteClock, encodedDelta, isPartial) => {
    console.log('applying remote clock', remoteClock)
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
          const encodedState = await decryptAndVerify(encryptedState)
          if (keys && keys.read) {
            const newState = decode(encodedState)
            apply(newState)
          } else if (!isPartial) {
            console.log('GOT FULL STATE:', encodedState)
            state = encodedState
          }
        }
        debug('%s state after apply:', id, state)
        if (!keys.public || keys.write) {
          return [name, encode([name, forName && type.typeName, await signAndEncrypt(encode(state))])]
        }
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

  shared.join = async (_acc, delta) => {
    const acc = await _acc
    debug('%s: shared.join', id, delta, acc)
    const [previousClock, authorClock, encodedDelta] = delta
    const [forName, type, encryptedDelta] = decode(encodedDelta)
    debug('%s: shared.join [forName, type, encryptedDelta] = ', [forName, type, encryptedDelta])
    if (forName !== name) {
      throw new Error('delta name does not match:', forName)
    }
    if (!acc.has(name)) {
      acc.set(name, [name, type, previousClock, {}, crdt.initial()])
    }
    let [, , clock, previousAuthorClock, s1] = acc.get(name)
    const encodedState = await decryptAndVerify(encryptedDelta)
    const s2 = decode(encodedState)

    const newAuthorClock = vectorclock.incrementAll(previousAuthorClock, authorClock)
    const newState = crdt.join.call(voidChangeEmitter, s1, s2)
    acc.set(name, [name, type, clock, newAuthorClock, newState])

    debug('%s: shared.join: new state is', id, newState)

    return acc
  }

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
    state = crdt.join.call(changeEmitter, state, s)
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

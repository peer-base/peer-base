'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')
const Queue = require('p-queue')

const encode = require('../common/encode')
const decode = require('../common/decode')
const vectorclock = require('../common/vectorclock')

module.exports = async (id, type, store, keys) => {
  const queue = new Queue({ concurrency: 1 })
  const applyQueue = new Queue({ concurrency: 1 })
  const shared = new EventEmitter()
  const crdt = type(id)
  let state = crdt.initial()
  let clock = await store.getLatestClock()

  // Populate shared methods

  // shared mutators
  Object.keys(crdt.mutators).forEach((mutatorName) => {
    const mutator = crdt.mutators[mutatorName]
    shared[mutatorName] = (...args) => {
      const delta = mutator(state, ...args)
      clock = vectorclock.increment(clock, id)
      apply(delta)

      queue.add(async () => {
        const encryptedDelta = await signAndEncrypt(encode(delta))
        const newClock = await store.saveDelta([null, null, encryptedDelta])
        clock = vectorclock.merge(clock, newClock)
      }).catch((err) => shared.emit('error', err))
    }
  })

  // shared value
  shared.value = () => crdt.value(state)

  shared.apply = (remoteClock, encryptedState) => {
    if (!Buffer.isBuffer(encryptedState)) {
      throw new Error('can only apply from buffer')
    }
    debug('%s: shared.apply %j', id, remoteClock, encryptedState)
    return applyQueue.add(async () => {
      if (!containsClock(remoteClock)) {
        const encodedState = await decryptAndVerify(encryptedState)
        const newState = decode(encodedState)
        clock = vectorclock.merge(clock, remoteClock)
        apply(newState)
      }

      return signAndEncrypt(encode(state))
    })
  }

  shared.stop = () => {
    // nothing to do here...
  }

  const storeState = await store.getState()
  if (storeState !== undefined && storeState !== null) {
    if (state === undefined || state === null) {
      state = storeState
    } else {
      console.log('joining', state, storeState)
      state = crdt.join(state, storeState)
    }
  }

  return shared

  function apply (s) {
    debug('%s: apply ', id, s)
    state = crdt.join(state, s)
    debug('new state after join is', state)
    shared.emit('state changed')
    return state
  }

  function containsClock (someClock) {
    const comparison = vectorclock.compare(clock, someClock)
    let contains
    if (comparison < 0) {
      contains = false
    }
    if (comparison > 0) {
      contains = true
    }
    contains = vectorclock.isIdentical(someClock, clock)

    debug('%s: containsClock %j ?: %j', id, someClock, contains)
    return contains
  }

  function signAndEncrypt (data) {
    return new Promise((resolve, reject) => {
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
    if (!Buffer.isBuffer(encrypted)) {
      throw new Error('need buffer')
    }
    return new Promise((resolve, reject) => {
      keys.cipher()
        .then((cipher) => cipher.decrypt(encrypted, (err, decrypted) => {
          if (err) {
            return reject(err)
          }
          const [encoded, signature] = decode(decrypted)

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

'use strict'

const debug = require('debug')('peer-star:collaboration:shared')
const EventEmitter = require('events')
const Queue = require('p-queue')
const b58Decode = require('bs58').decode

const { encode, decode } = require('delta-crdts-msgpack-codec')
const vectorclock = require('../common/vectorclock')

module.exports = (name, id, crdtType, collaboration, keys, options) => {
  const applyQueue = new Queue({ concurrency: 1 })
  const shared = new EventEmitter()
  const changeEmitter = new ChangeEmitter(shared)
  let clock = {}
  let deltas = []
  let state = crdtType.initial()
  const memo = {}

  const applyAndPushDelta = (delta) => {
    const previousClock = clock
    clock = vectorclock.increment(clock, id)
    apply(delta, true)
    const author = {}
    author[id] = 1
    return applyQueue.add(async () => {
      const namedDelta = [name, crdtType.typeName, await signAndEncrypt(encode(delta))]
      const deltaRecord = [previousClock, author, namedDelta]
      deltas.push(deltaRecord)
      shared.emit('clock changed', clock)
    })
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
    const [previousClock, authorClock, namedDelta] = deltaRecord
    const [forName, typeName, encryptedState] = namedDelta
    if (forName === name) {
      return applyQueue.add(async () => {
        const delta = decode(await decryptAndVerify(encryptedState))
        deltas.push(deltaRecord)
        clock = vectorclock.merge(clock, vectorclock.sumAll(previousClock, authorClock))
        apply(delta)
        shared.emit('clock changed', clock)
      })
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

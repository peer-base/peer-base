'use strict'

const pull = require('pull-stream')

module.exports = (fromStore, toStore, addedKeys, removedKeys) => {
  if (!addedKeys) {
    addedKeys = new Set()
    return replicateAll(addedKeys).then(() => removeKeysNotIn(addedKeys))
  } else {
    return replicateSome(addedKeys).then(() => removeKeysIn(removedKeys))
  }

  function replicateAll (addedKeys) {
    return new Promise((resolve, reject) => {
      pull(
        fromStore.query({}),
        pull.asyncMap((entry, done) => {
          addedKeys.add(entry.key.toString())
          toStore.get(entry.key, (err, result) => {
            if (err && err.code !== 'ERR_NOT_FOUND') {
              return done(err)
            }
            if (areDifferent(entry.value, result)) {
              toStore.put(entry.key, entry.value, done)
            } else {
              done()
            }
          })
        }),
        pull.onEnd((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      )
    })
  }

  function replicateSome (keys) {
    return Promise.all([...keys].map(replicateKey))
  }

  function replicateKey (key) {
    return new Promise((resolve, reject) => {
      fromStore.get(key, (err, value) => {
        if (err) {
          return reject(err)
        }
        toStore.put(key, value, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    })
  }

  function removeKeysIn (keys = new Set()) {
    return Promise.all([...keys].map(removeKey))
  }

  function removeKey (key) {
    return new Promise((resolve, reject) => {
      toStore.delete(key, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  function removeKeysNotIn (keys) {
    return new Promise((resolve, reject) => {
      pull(
        toStore.query({}),
        pull.asyncMap((entry, done) => {
          if (!keys.has(entry.key.toString())) {
            toStore.delete(entry.key, done)
          } else {
            done()
          }
        }),
        pull.onEnd((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      )
    })
  }
}

function areDifferent (a, b) {
  if (!Buffer.isBuffer(b)) {
    return true
  }
  if (a.length !== b.length) {
    return true
  }
  for (const [i, value] of a.entries()) {
    if (b[i] !== value) {
      return true
    }
  }

  return false
}

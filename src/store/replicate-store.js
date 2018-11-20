'use strict'

const pull = require('pull-stream')

module.exports = (fromStore, toStore) => {
  const keys = new Set()
  return new Promise((resolve, reject) => {
    pull(
      fromStore.query({}),
      pull.asyncMap((entry, done) => {
        keys.add(entry.key.toString())
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
          resolve(removeKeysNotIn(keys))
        }
      })
    )
  })

  function removeKeysNotIn(keys) {
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
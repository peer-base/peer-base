/* eslint no-warning-comments: "off" */
'use strict'

const crypto = require('libp2p-crypto')

module.exports = (keys) => {
  const key = Buffer.from(keys.read.bytes)
  const iv = Buffer.from(keys.read.bytes) // TODO: fix this

  return () => {
    return new Promise((resolve, reject) => {
      crypto.aes.create(Buffer.from(key).slice(0, 32), Buffer.from(iv).slice(0, 16), (err, key) => {
        if (err) {
          return reject(err)
        }
        resolve(key)
      })
    })
  }
}

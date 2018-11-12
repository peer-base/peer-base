'use strict'

const crypto = require('libp2p-crypto')
const deriveCipherFromKeys = require('./derive-cipher-from-keys')

const defaultOptions = {
  algo: 'Ed25519',
  bits: 512
}

async function generateKeys (options) {
  return new Promise((resolve, reject) => {
    options = Object.assign({}, defaultOptions, options)
    crypto.keys.generateKeyPair(options.algo, options.bits, (err, key) => {
      if (err) { return reject(err) }
      const keys = {
        read: key.public,
        write: key
      }
      keys.cipher = deriveCipherFromKeys(keys)
      resolve(keys)
    })
  })
}

module.exports = generateKeys

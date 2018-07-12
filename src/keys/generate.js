'use strict'

const crypto = require('libp2p-crypto')

const defaultOptions = {
  algo: 'Ed25519',
  bits: 512
}

async function generateKeys (options) {
  return new Promise((resolve, reject) => {
    options = Object.assign({}, defaultOptions, options)
    crypto.keys.generateKeyPair(options.algo, options.bits, (err, key) => {
      if (err) { return reject(err) }
      resolve({
        'read': key.public,
        'write': key
      })
    })
  })
}

module.exports = generateKeys

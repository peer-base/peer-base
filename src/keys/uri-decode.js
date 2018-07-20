'use strict'

const bs58 = require('bs58')
const crypto = require('libp2p-crypto')
const deriveCipherFromKeys = require('./derive-cipher-from-keys')

function uriDecode (str) {
  return new Promise((resolve, reject) => {
    const keyComponents = str.split('-')
    if (keyComponents.length < 1 || keyComponents.length > 2) {
      throw new Error('invalid URI')
    }
    const readEncoded = keyComponents[0]
    const read = bs58.decode(readEncoded)
    const writeEncoded = keyComponents[1]
    const write = writeEncoded && bs58.decode(writeEncoded)

    const readKey = crypto.keys.unmarshalPublicKey(read)

    const keys = {
      read: readKey,
    }

    keys.cipher = deriveCipherFromKeys(keys)

    if (write) {
      crypto.keys.unmarshalPrivateKey(write, (err, writeKey) => {
        if (err) {
          return reject(err)
        }

        keys.write = writeKey

        resolve(keys)
      })
    } else {
      resolve(keys)
    }
  })
}

module.exports = uriDecode

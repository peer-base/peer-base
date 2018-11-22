'use strict'

const { encode, decode } = require('delta-crdts-msgpack-codec')

function signAndEncrypt (keys, data) {
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

function decryptAndVerify (keys, encrypted) {
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

module.exports = {
  signAndEncrypt,
  decryptAndVerify
}

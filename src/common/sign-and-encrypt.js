'use strict'

const encode = require('./encode')

module.exports = signAndEncrypt

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

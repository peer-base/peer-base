'use strict'

const bs58 = require('bs58')
const crypto = require('libp2p-crypto')

function uriEncode (keys) {
  const uri = []
  uri.push(bs58.encode(crypto.keys.marshalPublicKey(keys.read)))

  if (keys.write) {
    uri.push(bs58.encode(crypto.keys.marshalPrivateKey(keys.write)))
  }

  return uri.join('-')
}

module.exports = uriEncode

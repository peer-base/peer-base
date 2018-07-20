'use strict'

const bs58 = require('bs58')
const crypto = require('libp2p-crypto')

function uriEncodeReadOnly (keys) {
  return bs58.encode(crypto.keys.marshalPublicKey(keys.read))
}

module.exports = uriEncodeReadOnly

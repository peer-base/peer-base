'use strict'

const crypto = require('libp2p-crypto')
const bs58 = require('bs58')

module.exports = () => bs58.encode(crypto.randomBytes(32))

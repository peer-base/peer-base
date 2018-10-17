'use strict'

const bs58 = require('bs58')

function randomPeerIdBuffer () {
  const bitCount = 32
  const bits = Array(bitCount)
  for (let i = 0; i < bitCount; i++) {
    bits[i] = Math.floor(Math.random() * 256)
  }

  return Buffer.from(bits)
}

module.exports = function randomPeerId () {
  return bs58.encode(randomPeerIdBuffer())
}

module.exports.buffer = randomPeerIdBuffer

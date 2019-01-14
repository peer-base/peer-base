'use strict'

const b58Decode = require('bs58').decode
const radix64 = require('radix-64')()

// Decoding the id results in a 34 byte buffer, so cut it down to the last
// 8 bytes, then radix64 encode to fit it efficiently into a string
module.exports = (peerId) => {
  const buff = b58Decode(peerId)
  return radix64.encodeBuffer(buff.slice(buff.length - 8))
}

'use strict'

const msgpack = require('msgpack-lite')
const codec = require('./codec')
const options = {
  codec
}

module.exports = function encode (value) {
  return msgpack.encode(value, options)
}

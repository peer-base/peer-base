'use strict'

const msgpack = require('msgpack-lite')
const codec = require('./codec')
const options = {
  codec
}

module.exports = function decode (data) {
  return msgpack.decode(data, options)
}

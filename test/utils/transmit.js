'use strict'

const { encode, decode } = require('delta-crdts-msgpack-codec')

module.exports = (o) => decode(encode(o))

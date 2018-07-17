'use strict'

const msgpack = require('msgpack-lite')

const codec = msgpack.createCodec()

codec.addExtPacker(0x40, Map, [mapPacker, msgpack.encode])
codec.addExtUnpacker(0x40, [msgpack.decode, mapUnpacker])

codec.addExtPacker(0x41, Set, [setPacker, msgpack.encode])
codec.addExtUnpacker(0x41, [msgpack.decode, setUnpacker])

module.exports = codec

function mapPacker (map) {
  return Array.from(map)
}

function mapUnpacker (array) {
  return new Map(array)
}

function setPacker (set) {
  return Array.from(set)
}

function setUnpacker (array) {
  return new Set(array)
}

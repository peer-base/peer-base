'use strict'

module.exports = function encode (data) {
  return Buffer.from(JSON.stringify(data))
}

'use strict'

module.exports = function decode (data) {
  return JSON.parse(data.toString())
}

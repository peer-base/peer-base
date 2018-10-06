'use strict'

const decode = require('delta-crdts-msgpack-codec').decode

module.exports = function handlingData (dataHandler) {
  return (data) => {
    let message
    try {
      message = decode(data)
    } catch (err) {
      dataHandler(err)
      return true
    }

    try {
      dataHandler(null, message)
    } catch (err) {
      dataHandler(err)
    }

    return true
  }
}

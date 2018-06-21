'use strict'

const decode = require('./decode')

module.exports = function handlingData (dataHandler) {
  return (data) => {
    let message
    try {
      message = decode(data)
    } catch (err) {
      dataHandler(err)
    }

    dataHandler(null, message)
    return true
  }
}

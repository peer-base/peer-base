'use strict'

const server = require('./test/utils/rendezvous')()

module.exports = {
  hooks: {
    pre: (callback) => server.start().then(callback),
    post: (callback) => server.stop().then(callback)
  }
}

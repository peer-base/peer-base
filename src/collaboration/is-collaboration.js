'use strict'

const Collaboration = require('./index').Collaboration

module.exports = (o) => {
  return o instanceof Collaboration
}

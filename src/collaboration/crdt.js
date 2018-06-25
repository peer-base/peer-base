'use strict'

const CRDT = require('delta-crdts')

module.exports = (crdt) => {
  if (typeof crdt === 'string') {
    crdt = CRDT.type(crdt)
  }

  return crdt
}

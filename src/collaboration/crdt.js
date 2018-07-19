'use strict'

const CRDT = require('delta-crdts')

module.exports = (typeName) => {
  if (typeof typeName !== 'string') {
    throw new Error('CRDT type should be string')
  }
  const crdt = CRDT.type(typeName)
  crdt.typeName = typeName

  return crdt
}

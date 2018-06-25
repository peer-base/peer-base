'use strict'

const CRDT = require('delta-crdts')
const uniq = require('lodash.uniq')

const fake = module.exports = (id) => ({
  initial: () => '',
  join (s1, s2) {
    if (typeof s1 !== 'string') {
      throw new Error('need string!: ' + JSON.stringify(s1))
    }
    if (typeof s2 !== 'string') {
      throw new Error('need 2nd string!: ' + JSON.stringify(s2))
    }
    const result = uniq((s1 + s2).split('')).sort().join('')
    return result
  },
  value: (s) => s,
  mutators: {
    add: (s, str) => {
      return str
    }
  }
})

CRDT.define('fake', fake)

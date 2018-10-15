'use strict'

const CRDT = require('delta-crdts')

const fake = module.exports = {
  initial: () => new Set(),
  join (s1, s2) {
    const all = Array.from(s1).concat(Array.from(s2))
    return new Set(all)
  },
  value: (s) => Array.from(s).sort().join(''),
  mutators: {
    add: (id, s, str) => {
      return new Set(str)
    }
  }
}

CRDT.define('fake', fake)

'use strict'

const vectorclock = require('vectorclock')

exports.merge = vectorclock.merge
exports.isIdentical = vectorclock.isIdentical
exports.compare = vectorclock.compare

exports.increment = (clock, author) => {
  return vectorclock.increment(Object.assign({}, clock), author)
}

exports.delta = (c1, c2) => {
  const deltas = {}

  const keys = new Set()
  Object.keys(c1).forEach((k) => keys.add(k))
  Object.keys(c2).forEach((k) => keys.add(k))

  for (let k of keys) {
    if (c1[k] !== c2[k]) {
      deltas[k] = c2[k]
    }
  }

  return deltas
}

exports.isFirstDirectChildOfSecond = (first, second) => {
  let diff = 0
  for (let key of Object.keys(first)) {
    diff += first[key] - (second[key] || 0)
    if (diff > 1) {
      return false
    }
  }

  return diff === 1
}

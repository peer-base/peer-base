'use strict'

const vectorclock = require('vectorclock')

exports.merge = vectorclock.merge
exports.isIdentical = vectorclock.isIdentical
exports.compare = vectorclock.compare

exports.increment = (clock, author) => {
  if (author) {
    return vectorclock.increment(Object.assign({}, clock), author)
  }
  return Object.assign({}, clock)
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

exports.isInFirstEqualToSecond = (first, second) => {
  for (let key of Object.keys(first)) {
    if (first[key] !== second[key]) {
      console.log('isInFirstEqualToSecond %j / %j ? ', first, second, false)
      return false
    }
  }
  console.log('isInFirstEqualToSecond %j / %j ? ', first, second, true)
  return true
}

exports.doesSecondHaveFirst = (first, second) => {
  for (let key of Object.keys(first)) {
    if ((second[key] || 0) < first[key]) {
      return false
    }
  }
  return true
}

exports.isFirstImmediateToSecond = (first, second) => {
  let diff = 0
  for (let key of Object.keys(first)) {
    const firstValue = first[key]
    const secondValue = second[key] || 0
    if (secondValue < firstValue) {
      diff += firstValue - secondValue
      if (diff > 1) {
        return false
      }
    }
  }

  return diff === 1
}

exports.incrementAll = (_clock, authorClock) => {
  const clock = Object.assign({}, _clock)
  Object.keys(authorClock).forEach((author) => {
    let current = clock[author] || 0
    current += authorClock[author]
    clock[author] = current
  })
  return clock
}

exports.diff = (a, b) => {
  const result = {}
  for(let [peer, clock] of Object.entries(b)) {
    const previousClock = a[peer] || 0
    if (previousClock !== clock) {
      result[peer] = clock
    }
  }
  return result
}

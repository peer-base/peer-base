'use strict'

const vectorclock = require('vectorclock')

exports.compare = vectorclock.compare

exports.isIdentical = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])

  for (let key of keys) {
    if ((a[key] || 0) !== (b[key] || 0)) {
      return false
    }
  }

  return true
}

exports.merge = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const result = {}

  for (let key of keys) {
    result[key] = Math.max(a[key] || 0, b[key] || 0)
  }

  return result
}

exports.increment = (clock, author) => {
  if (author) {
    return vectorclock.increment(Object.assign({}, clock), author)
  }
  return Object.assign({}, clock)
}

exports.delta = (c1, c2) => {
  const deltas = {}

  const keys = new Set([...Object.keys(c1), ...Object.keys[c2]])

  for (let k of keys) {
    if (c1[k] !== c2[k]) {
      deltas[k] = c2[k]
    }
  }

  return deltas
}

exports.isDeltaInteresting = (delta, currentClock) => {
  const [previousClock, authorClock] = delta

  // find out if previous clock is inside currentClock
  const authors = new Set([...Object.keys(currentClock), Object.keys(previousClock)])
  for (let author of authors) {
    if ((previousClock[author] || 0) > (currentClock[author] || 0)) {
      return false
    }
  }

  // find out if new clock lands outside of  current clock
  Object.keys(authorClock).forEach((author) => authors.add(author))
  const deltaClock = exports.sumAll(previousClock, authorClock)

  for (let author of authors) {
    if ((deltaClock[author] || 0) > (currentClock[author] || 0)) {
      return true
    }
  }

  return false
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
      return false
    }
  }
  return true
}

exports.doesSecondHaveFirst = (first, second) => {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)])
  for (let key of keys) {
    if ((second[key] || 0) < (first[key] || 0)) {
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

exports.sumAll = (clock, authorClock) => {
  const keys = new Set([...Object.keys(clock), ...Object.keys(authorClock)])
  const result = {}

  for (let key of keys) {
    result[key] = (clock[key] || 0) + (authorClock[key] || 0)
  }

  return result
}

exports.minimum = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const result = {}
  for (let key of keys) {
    result[key] = Math.min((a[key] || 0), (b[key] || 0))
  }

  return result
}

exports.subtract = (base, next) => {
  const result = {}
  const keys = new Set([...Object.keys(base), ...Object.keys(next)])
  for (let key of keys) {
    const clockDiff = (next[key] || 0) - (base[key] || 0)
    if (clockDiff) {
      result[key] = clockDiff
    }
  }
  return result
}

exports.diff = (a, b) => {
  const result = {}
  for (let [peer, clock] of Object.entries(b)) {
    const previousClock = a[peer] || 0
    if (previousClock !== clock) {
      result[peer] = clock
    }
  }
  return result
}

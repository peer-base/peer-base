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

// A delta is interesting if
// 1. The delta starts inside the current clock
// 2. The delta ends outside the current clock
//
// Optionally you can supply peerClockId to ignore changes for the given peer
// (useful when we don't want to send a peer its own changes)
exports.isDeltaInteresting = (delta, currentClock, peerClockId) => {
  const [previousClock, authorClock] = delta

  // find out if previous clock is inside currentClock
  const authors = new Set([...Object.keys(currentClock), ...Object.keys(previousClock)])
  for (let author of authors) {
    if ((previousClock[author] || 0) > (currentClock[author] || 0)) {
      return false
    }
  }

  // find out if new clock lands outside of current clock
  Object.keys(authorClock).forEach((author) => authors.add(author))

  // If a target peer clock id was supplied, ignore changes to that id
  authors.delete(peerClockId)

  const deltaClock = exports.sumAll(previousClock, authorClock)
  for (let author of authors) {
    if ((deltaClock[author] || 0) > (currentClock[author] || 0)) {
      return true
    }
  }

  return false
}

// Does the second replica have all the information that the first replica has?
exports.doesSecondHaveFirst = (first, second) => {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)])

  // If the value for a particular key is smaller in the second vector clock,
  // then the second replica needs some information that the first replica has
  for (let key of keys) {
    if ((second[key] || 0) < (first[key] || 0)) {
      return false
    }
  }

  // Second replica has all the information that the first replica has
  return true
}

// Does the remote replica need information that the local replica has?
exports.doesRemoteNeedUpdate = (local, remote, remoteClockId) => {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])

  // Ignore remote's clock id because we assume that remote knows about any
  // changes that it made
  keys.delete(remoteClockId)

  // If the value for a particular key is smaller in the remote vector clock,
  // then the remote replica needs some information that the local replica has
  for (let key of keys) {
    if ((remote[key] || 0) < (local[key] || 0)) {
      return true
    }
  }

  // Remote replica has all the information that the local replica has
  return false
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

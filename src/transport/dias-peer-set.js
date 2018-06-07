'use strict'

const equal = require('./ring').equal

module.exports = (bytes, id) => {
  const fullRing = new Buffer(bytes)
  for (let i = 0; i < bytes; i++) {
    fullRing[i] = 0xff
  }
  const oneFifth = sum(id, divideBy(fullRing, 5))
  const oneFourth = sum(id, divideBy(fullRing, 4))
  const oneThird = sum(id, divideBy(fullRing, 3))
  const oneHalf = oneHalfFrom(id)

  return (ring) => {
    const peers = new Set()

    const succ = ring.successorOf(id)
    if (!succ || equal(id, succ) || !peers.add(succ) ) {
      return peers
    }

    const succ2 = ring.successorOf(succ)
    if (!succ2 || equal(id, succ2) || !peers.add(succ2) ) {
      return peers
    }

    const oneFifthAccross = ring.at(oneFifth)
    if (!oneFifthAccross || equal(id, oneFifthAccross) || !peers.add(oneFifthAccross) ) {
      return peers
    }

    const oneFourthAccross = ring.at(oneFourth)
    if (!oneFourthAccross || equal(id, oneFourthAccross) || !peers.add(oneFourthAccross) ) {
      return peers
    }

    const oneThirdAccross = ring.at(oneThird)
    if (!oneThirdAccross || equal(id, oneThirdAccross) || !peers.add(oneThirdAccross) ) {
      return peers
    }

    const halfWayAcrossPlusOne = ring.successorOf(oneHalf)
    if (equal(id, halfWayAcrossPlusOne) || !peers.add(halfWayAcrossPlusOne) ) {
      return peers
    }

    return peers

    function add (peer) {
      for (let p of peers) {
        if (equal(p, peer)) {
          return false
        }
      }
      peers.add(peer)
      return true
    }
  }

  function sum (a, b) {
    const result = new Buffer(bytes)
    let carry = 0
    for (let i = bytes - 1; i >= 0; i--) {
      const l = a[i] || 0
      const r = b[i] || 0
      const s = l + r + carry
      result[i] = s & 0xff
      carry = s >> 8
    }

    return result
  }

  function divideBy (id, d) {
    const result = new Buffer(bytes)
    let remainder = 0
    for(let i = 0; i < bytes; i++) {
      let byte = id[i] + (remainder << 8)
      if (byte < d) {
        result[i] = 0
        byte = (byte << 8) + id[++i]
      }
      result[i] = Math.floor(byte / d)
      remainder = byte % d
    }
    return result
  }

  function oneHalfFrom (id) {
    const half = new Buffer(bytes)
    for (let i=1; i < bytes; i++) {
      half[i] = 0xff
    }
    half[0] = 0x7f
    return sum(bytes, half)
  }
}

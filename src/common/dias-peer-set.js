'use strict'

const PeerSet = require('./peer-set')

module.exports = (bytes, peerInfo, preambleBytes) => {
  const id = peerInfo.id.toBytes().slice(preambleBytes)
  const fullRing = Buffer.alloc(bytes)
  for (let i = 0; i < bytes; i++) {
    fullRing[i] = 0xff
  }
  const oneFifth = sum(id, divideBy(fullRing, 5))
  const oneFourth = sum(id, divideBy(fullRing, 4))
  const oneThird = sum(id, divideBy(fullRing, 3))
  const oneHalf = oneHalfFrom(id)

  return (ring) => {
    const peers = new PeerSet()

    const ringSize = ring.size

    if (!ringSize) {
      return peers
    }

    const succ = ring.successorOf(peerInfo)
    add(succ)
    add(ring.successorOf(succ))
    add(ring.at(oneFifth))
    add(ring.at(oneFourth))
    add(ring.at(oneThird))
    add(ring.successorOf(oneHalf))

    return peers

    function add (peer) {
      if (peer) addOrAddSuccessor(peer)
    }

    function addOrAddSuccessor (peer, stop) {
      if (!peers.has(peer)) {
        peers.add(peer)
      } else {
        if (peer === stop) return
        addOrAddSuccessor(ring.successorOf(peer), stop || peer)
      }
    }
  }

  function sum (a, b) {
    const result = Buffer.alloc(bytes)
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
    const result = Buffer.alloc(bytes)
    let remainder = 0
    for (let i = 0; i < bytes; i++) {
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
    const half = Buffer.alloc(bytes)
    for (let i = 1; i < bytes; i++) {
      half[i] = 0xff
    }
    half[0] = 0x7f
    return sum(bytes, half)
  }
}

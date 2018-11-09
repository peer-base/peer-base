'use strict'

const PeerSet = require('./peer-set')
const BigInt = require('big-integer')

module.exports = (bytes, peerInfo, preambleBytes) => {
  const id = peerInfo.id.toBytes().slice(preambleBytes)
  const fullRing = Buffer.alloc(bytes)
  for (let i = 0; i < bytes; i++) {
    fullRing[i] = 0xff
  }
  const oneFifth = sum(id, divideBy(fullRing, 5))
  const oneFourth = sum(id, divideBy(fullRing, 4))
  const oneThird = sum(id, divideBy(fullRing, 3))
  const oneHalf = sum(id, oneHalfFrom(fullRing))

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

  function sum (_a, _b) {
    const a = numberFromId(_a)
    const b = numberFromId(_b)
    const result = a.add(b).mod(numberFromId(fullRing))
    return idFromNumber(result)
  }

  function divideBy (_id, d) {
    const result = numberFromId(_id).divide(d)
    return idFromNumber(result)
  }

  function numberFromId (id) {
    const str = id.toString('hex')
    const result = BigInt(str, 16)
    return result
  }

  function idFromNumber (i) {
    const resultBytes = i.toArray(256).value
    while (resultBytes.length < bytes) {
      resultBytes.unshift(0)
    }

    return Buffer.from(resultBytes)
  }

  function oneHalfFrom (id) {
    const n = numberFromId(id)
    const result = n.divide(2)
    return idFromNumber(result)
  }
}

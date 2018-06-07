'use strict'

const equal = require('./ring').equal

class PeerSet extends Set {
  constructor () {
    super()
    this._idMap = new Map()
  }

  add (peerInfo) {
    const key = keyFromPeerInfo(peerInfo)
    if (!super.has(key)) {
      this._idMap.set(key, peerInfo)
    }
    return super.add(key)
  }

  has (peerInfo) {
    const key = keyFromPeerInfo(peerInfo)
    return super.has(key)
  }

  delete (peerInfo) {
    const key = keyFromPeerInfo(peerInfo)
    if (super.has(key)) {
      this._idMap.delete(key)
      return super.delete(key)
    }
  }

  values () {
    return this._idMap.values()
  }
}

module.exports = PeerSet

function keyFromPeerInfo (peerInfo) {
  return peerInfo.id.toBytes().toString('hex')
}

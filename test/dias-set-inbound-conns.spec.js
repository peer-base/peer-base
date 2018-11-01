/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerId = require('peer-id')
const Ring = require('../src/common/ring')
const DiasSet = require('../src/common/dias-peer-set')

const PEER_COUNT = 20

const options = {
  preambleByteCount: 2,
  peerIdByteCount: 32
}

async function generatePeer() {
  const peerId = await new Promise((resolve, reject) => {
    PeerId.create({ bits: 1024 }, (err, data) => err ? reject(err) : resolve(data))
  })
  const peerInfo = {
    id: peerId
  }
  return {
    peerInfo,
    b58: peerInfo.id.toB58String(),
    diasSet: DiasSet(options.peerIdByteCount, peerInfo, options.preambleByteCount)
  }
}

describe('dias set inbound connections', () => {
  let peers

  before(async function () {
    this.timeout(10000)
    peers = (await Promise.all([...Array(PEER_COUNT)].map(() => generatePeer()))).sort(comparePeerId)
  })

  it('distributes inbound connections evenly', async function () {
    const ring = Ring(options.preambleByteCount)
    peers.forEach(p => {
      ring.add(p.peerInfo)
    })
    peers.forEach(p => {
      p.outbound = p.diasSet(ring)
    })

    let maxInbound = 0
    let maxOutbound = 0

    for (let p of peers) {
      p.inboundPeers = peers.filter(pi => pi !== p && pi.outbound.has(p.peerInfo))

      // filter out self
      const outbound = [...p.outbound].filter(o => o != p.peerInfo.id.toHexString())

      maxInbound = Math.max(maxInbound, p.inboundPeers.length)
      maxOutbound = Math.max(maxOutbound, outbound.length)
    }

    expect(maxInbound).to.be.lessThan(peers.length * 0.75)
    expect(maxOutbound).to.be.lessThan(peers.length * 0.75)
  })
})

function comparePeerId (peerA, peerB) {
  return compareBuffers(peerA.peerInfo.id.toBytes(), peerB.peerInfo.id.toBytes())
}

function compareBuffers (buf1, buf2) {
  if (buf1.length > buf2.length) {
    return 1
  }
  if (buf2.length > buf1.length) {
    return -1
  }
  for (let i = buf1.length - 1; i >= 0; i--) {
    if (buf1[i] > buf2[i]) {
      return 1
    } else if (buf2[i] > buf1[i]) {
      return -1
    }
  }

  return 0
}

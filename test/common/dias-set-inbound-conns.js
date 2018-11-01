/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerId = require('peer-id')
const Ring = require('../../src/common/ring')
const DiasSet = require('../../src/common/dias-peer-set')

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
  it('distributes inbound connections evenly', async () => {
    const peers = await Promise.all([...Array(PEER_COUNT)].map(() => generatePeer()))

    const ring = Ring(options.preambleByteCount)
    peers.forEach(p => {
      ring.add(p.peerInfo)
    })
    peers.forEach(p => {
      p.outbound = p.diasSet(ring)
    })

    let maxInbound = 0
    let maxOutbound = 0
    peers.forEach(p => {
      p.inboundPeers = peers.filter(pi => pi !== p && pi.outbound.has(p.peerInfo))
      console.log(p.b58)
      console.log('inbound:', p.inboundPeers.length)
      p.inboundPeers.sort().forEach(pi => console.log('- ', pi.b58))

      // filter out self
      const outbound = [...p.outbound].filter(o => o != p.peerInfo.id.toHexString())
      console.log('outbound:', outbound.length)
      outbound.sort().forEach(poHex => {
        const po = PeerId.createFromHexString(poHex)
        console.log('- ', po.toB58String())
      })
      console.log()

      maxInbound = Math.max(maxInbound, p.inboundPeers.length)
      maxOutbound = Math.max(maxOutbound, outbound.length)
    })

    console.log('Of', peers.length, 'peers:')
    console.log('Max inbound:', maxInbound)
    console.log('Max outbound:', maxOutbound)

    expect(maxInbound).to.be.lessThan(peers.length * 0.75)
    expect(maxOutbound).to.be.lessThan(peers.length * 0.75)
  })
})

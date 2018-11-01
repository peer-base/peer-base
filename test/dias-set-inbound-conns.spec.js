/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerId = require('peer-id')
const Ring = require('../src/common/ring')
const DiasSet = require('../src/common/dias-peer-set')

const options = {
  preambleByteCount: 2,
  peerIdByteCount: 32
}

const peerIds = [ 'QmdZgq8EZExtxYeW7aqE12BLATYhMWrnHqriMkXw9drc2h',
  'QmTD6xzch1EgjV5ZCX6kvLRXENHggRo811noo2oGMFo3UW',
  'QmWkX8hBenAqZXwjQY1cb78LDQ8pMyzUks2QVtynWgUPpG',
  'QmVLvGyjqqWuNZHjMsXGGFjwCMznk6tJUWuB6H6fAJYEVM',
  'QmRURs2SsskwgAVUa9mM6kgzVxyGfdhqPuPZD6h2v2XqPR',
  'QmThDTXb6wf3S2GxHmcWp2w6vJEkruza8D9qiu1Kune4Lg',
  'QmQ8UqWDEWti8U6kE7UMwp477Z8QJaV8fMvwXruV8wYnA9',
  'QmQLYcYh32LizFYvFPDgx27TXSM7wvFAQYAxYAajcnxHYE',
  'QmV6GQh3DDgXv8VDjGjVvYhGdYkAZvNxntq4EUEcAnfPN8',
  'QmSXKpdAr5CgAKmLpzbyd6gKE2G9B27ndtRhXzE5AaAmu3',
  'QmbxfF1FHChXRgR9nF2Qaw8R4MPWruSsPtiG314ntidqd9',
  'QmXPuToFKkiyW1jba3cGgdfdQem3mJ9w4msgSks42Ehjrd',
  'QmVC2FJLiVfJesWMVfrR88rsobxBZVk4hKMaRCKWfmGiC5',
  'QmbpeVfC7BULYT9A6Qx5kuX8B8jRJk7FBBNsdqBFrtGD3n',
  'Qme39PBMcn25sDUsCxW2VqNJeqG4ovkpYztfLp1gKhgeAi',
  'QmTvpSWpWChNsRaygHnzSJ6BuKm8D2pMtoDM5QQpnnb392',
  'QmXa69N4c4REhdE7pW8C7Fb86MFzM3KkAwB82siYtffzSP',
  'Qmeax6iUnuceHbNr1Gx659xvn9wTyVYBudWoPZ4Ezvae7Z',
  'QmVCM89L3Zm26ZbBhkvJkktm3yLNzzhgQiF7YmGatYue9W',
  'QmZtui53gKXrShG7tHL1CsfojHoHHF7fu7gzMS9YVjnj6c' ]

const generatePeer = (peerIdB58) => {
  const peerId = PeerId.createFromB58String(peerIdB58)
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
  it('distributes inbound connections evenly', () => {
    const peers = peerIds.map(generatePeer)
    const ring = Ring(options.preambleByteCount)
    for (let p of peers) {
      ring.add(p.peerInfo)
    }
    for (let p of peers) {
      p.outbound = p.diasSet(ring)
    }

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

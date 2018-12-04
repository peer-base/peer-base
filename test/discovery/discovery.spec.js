/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const Ring = require('../../src/common/ring')
const Discovery = require('../../src/discovery/discovery')
const FakePeerInfo = require('../utils/fake-peer-info')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('discovery', () => {
  let appTopic
  let peerInfos
  let peerTopics
  let peerDiscovery
  let ring
  let floodSub
  let dials
  let libp2p
  let discovery

  before(() => {
    appTopic = 'my topic'

    peerInfos = {
      a: new FakePeerInfo('a'),
      b: new FakePeerInfo('b'),
      c: new FakePeerInfo('c'),
      d: new FakePeerInfo('d'),
      e: new FakePeerInfo('e')
    }
    peerTopics = new Map([
      [peerInfos.a, [appTopic, 'some other topic']],
      [peerInfos.b, ['another topic', appTopic, 'some other topic']],
      // Not interested in our app topic
      [peerInfos.c, ['some other topic']],
      [peerInfos.d, ['some other topic', appTopic]]
    ])

    const app = {
      peerCountGuess: () => 0
    }

    peerDiscovery = new EventEmitter()
    peerDiscovery.start = () => {}
    peerDiscovery.stop = () => {}

    ring = Ring(0)
    floodSub = new EventEmitter()
    dials = []
    libp2p = Object.assign(new EventEmitter(), {
      isStarted () {
        return Boolean(this._started)
      },
      start () {
        this._started = true
        this.emit('start')
      },
      dial: (peerInfo, cb) => {
        dials.push(peerInfo)
        if (peerInfo === peerInfos.e) {
          return cb(new Error('dial error'))
        }
        setTimeout(() => {
          const topics = new Set(peerTopics.get(peerInfo))
          floodSub.emit('floodsub:subscription-change', peerInfo, topics)
        }, 10)
      },
      _floodSub: floodSub
    })
    const ipfs = {
      _libp2pNode: libp2p
    }

    const opts = {
      dialerBackoffMin: 10
    }
    discovery = new Discovery(app, appTopic, ipfs, peerDiscovery, ring, opts)
  })

  it('dials peers even if discovered before startup', async () => {
    // Emit some peers before startup
    peerDiscovery.emit('peer', peerInfos.a)
    peerDiscovery.emit('peer', peerInfos.b)
    peerDiscovery.emit('peer', peerInfos.c)

    await waitFor(50)

    // No dials yet because we haven't started
    expect(dials.length).to.equal(0)

    // Start discovery
    discovery.start()

    await waitFor(50)

    // Still no dials yet because libp2p hasn't started
    expect(dials.length).to.equal(0)

    // Once we start and libp2p starts, these peers should get dialed
    libp2p.start()

    await waitFor(50)

    expect(dials.length).to.equal(3)
    expect(ring.has(peerInfos.a)).to.equal(true)
    expect(ring.has(peerInfos.b)).to.equal(true)
    // Not interested in our app topic
    expect(ring.has(peerInfos.c)).to.equal(false)
  })

  it('dials peers discovered after startup', async () => {
    dials = []

    // After start, emit another peer
    peerDiscovery.emit('peer', peerInfos.d)

    await waitFor(50)

    // New peer should have been dialed
    expect(dials.length).to.equal(1)
    expect(ring.has(peerInfos.d)).to.equal(true)
  })

  it('connects to newly interested peers and disconnects from peers that are not interested', async () => {
    // Emit floodsub events indicating that one peer is newly interested
    // in our topic and another peer is no longer interested
    const topicsC = new Set([appTopic, 'some other topic'])
    const topicsD = new Set(['some other topic'])
    floodSub.emit('floodsub:subscription-change', peerInfos.c, topicsC)
    floodSub.emit('floodsub:subscription-change', peerInfos.d, topicsD)

    await waitFor(50)

    // Ring should have been updated
    expect(ring.has(peerInfos.c)).to.equal(true)
    expect(ring.has(peerInfos.d)).to.equal(false)
  })

  it('repeatedly dials peer after connection error', async () => {
    dials = []

    peerDiscovery.emit('peer', peerInfos.e)
    await waitFor(50)

    // Peer should have been dialed repeatedly
    expect(dials.length).to.be.gte(2)

    // Expect dials to stop after discovery is stopped
    discovery.stop()
    dials = []
    await waitFor(50)
    expect(dials.length).to.be.lte(1)
  })
})

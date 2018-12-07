/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const Discovery = require('../../src/discovery/discovery')
const FakePeerInfo = require('../utils/fake-peer-info')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('discovery', () => {
  const errPeerInfo = new FakePeerInfo('err')

  function createDiscovery (started = true) {
    const app = {
      peerCountGuess: () => 0
    }

    const peerDiscovery = new EventEmitter()
    peerDiscovery.start = () => {}
    peerDiscovery.stop = () => {}

    const disconnects = []
    const globalConnectionManager = {
      maybeHangUp (peerInfo) {
        disconnects.push(peerInfo)
      }
    }

    const dials = []
    const libp2p = Object.assign(new EventEmitter(), {
      isStarted () {
        return Boolean(this._started)
      },
      start () {
        this._started = true
        this.emit('start')
      },
      dial: (peerInfo, cb) => {
        dials.push(peerInfo)
        if (peerInfo === errPeerInfo) {
          return cb(new Error('dial error'))
        }
        setTimeout(() => cb(null, true), 10)
      }
    })
    const ipfs = {
      _libp2pNode: libp2p
    }

    const opts = {
      dialerBackoffMinMS: 10
    }
    const discovery = new Discovery(app, ipfs, peerDiscovery, globalConnectionManager, opts)

    const sim = {
      discovery,
      peerDiscovery,
      libp2p,
      dials,
      disconnects
    }
    return new Promise(resolve => {
      if (!started) return resolve(sim)

      discovery.on('start', () => resolve(sim))
      libp2p.start()
      discovery.start()
    })
  }

  it('dials peers even if discovered before startup', async () => {
    const { discovery, peerDiscovery, libp2p, dials } = await createDiscovery(false)

    // Emit some peers before startup
    const a = new FakePeerInfo('a')
    const b = new FakePeerInfo('b')
    const c = new FakePeerInfo('c')
    peerDiscovery.emit('peer', a)
    peerDiscovery.emit('peer', b)
    peerDiscovery.emit('peer', c)

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
    expect(discovery.hasConnection(a)).to.equal(true)
    expect(discovery.hasConnection(b)).to.equal(true)
    expect(discovery.hasConnection(c)).to.equal(true)
  })

  it('dials peers discovered after startup', async () => {
    const { discovery, peerDiscovery, dials } = await createDiscovery()

    // After start, emit another peer
    const d = new FakePeerInfo('d')
    peerDiscovery.emit('peer', d)

    await waitFor(50)

    // New peer should have been dialed
    expect(dials.length).to.equal(1)
    expect(discovery.hasConnection(d)).to.equal(true)
  })

  it('does not redial peer when dial is in progress', async () => {
    const { discovery, peerDiscovery, dials } = await createDiscovery()

    const e = new FakePeerInfo('e')
    peerDiscovery.emit('peer', e)
    peerDiscovery.emit('peer', e)
    peerDiscovery.emit('peer', e)
    peerDiscovery.emit('peer', e)

    await waitFor(50)

    // New peer should have been dialed once only
    expect(dials.length).to.equal(1)
    expect(discovery.hasConnection(e)).to.equal(true)
  })

  it('does not redial peer that is already connected', async () => {
    const { discovery, peerDiscovery, dials } = await createDiscovery()

    const f = new FakePeerInfo('f')
    peerDiscovery.emit('peer', f)

    await waitFor(50)

    // New peer should have been dialed
    expect(dials.length).to.equal(1)

    // Emit same peer again
    peerDiscovery.emit('peer', f)

    await waitFor(50)

    // New peer should not have been dialed a second time
    expect(dials.length).to.equal(1)
    expect(discovery.hasConnection(f)).to.equal(true)
  })

  it('does not dial peer if discovery is interrupted by stop', async () => {
    const { discovery, peerDiscovery, dials } = await createDiscovery()

    const g = new FakePeerInfo('g')
    peerDiscovery.emit('peer', g)
    discovery.stop()

    await waitFor(50)

    // New peer should not have been dialed
    expect(dials.length).to.equal(0)
    expect(discovery.hasConnection(g)).to.equal(false)
  })

  it('repeatedly dials peer after connection error', async () => {
    let { discovery, peerDiscovery, dials } = await createDiscovery()

    peerDiscovery.emit('peer', errPeerInfo)
    await waitFor(50)

    // Peer should have been dialed repeatedly
    expect(dials.length).to.be.gte(2)
    expect(discovery.hasConnection(errPeerInfo)).to.equal(false)

    // Expect dials to stop after discovery is stopped
    discovery.stop()
    dials = []
    await waitFor(50)
    expect(dials.length).to.be.lte(1)
  })

  it('resetConnection connects to newly interested peers and disconnects from peers that are not interested', async () => {
    let { discovery, peerDiscovery, dials, disconnects } = await createDiscovery()

    const interested = new FakePeerInfo('interested')
    const interested2 = new FakePeerInfo('interested2')
    const notInterested = new FakePeerInfo('not interested')
    peerDiscovery.emit('peer', interested)
    peerDiscovery.emit('peer', interested2)
    peerDiscovery.emit('peer', notInterested)

    await waitFor(50)
    expect(dials.length).to.equal(3)

    const interested3 = new FakePeerInfo('interested3')
    const diasSet = new Set([ interested, interested2, interested3 ])
    discovery.resetConnections(diasSet)

    await waitFor(50)

    // Should have connected to newly interesting peer
    expect(dials.length).to.equal(4)

    // Should be connected to interested peers
    expect(discovery.hasConnection(interested)).to.equal(true)
    expect(discovery.hasConnection(interested2)).to.equal(true)
    expect(discovery.hasConnection(interested3)).to.equal(true)

    // Should have disconnected from not interested peers
    expect(discovery.hasConnection(notInterested)).to.equal(false)

    // Should have disconnected from notInterested
    expect(disconnects.length).to.equal(1)
  })
})

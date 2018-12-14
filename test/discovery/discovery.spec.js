/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const Discovery = require('../../src/discovery/discovery')
const Dialer = require('../../src/discovery/dialer')
const FakePeerInfo = require('../utils/fake-peer-info')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('discovery', () => {
  const errPeerInfo = new FakePeerInfo('err')

  function createDiscovery (started = true) {
    const app = {
      name: 'my app',
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

    const floodSub = new EventEmitter()
    const libp2p = Object.assign(new EventEmitter(), {
      isStarted () {
        return Boolean(this._started)
      },
      start () {
        this._started = true
        this.emit('start')
      },
      _floodSub: floodSub
    })
    const ipfs = {
      _libp2pNode: libp2p
    }

    const opts = {
      dialerBackoffMinMS: 10
    }
    const dials = []
    const dialer = new Dialer({
      dial: (peerInfo, cb) => {
        dials.push(peerInfo)
        if (peerInfo === errPeerInfo) {
          return cb(new Error('dial error'), false)
        }
        setTimeout(() => cb(null, true), 10)
      }
    }, opts)

    const connMgr = {
      hasConnection (peerInfo) {
        return false
      }
    }

    const discovery = new Discovery(app, ipfs, dialer, peerDiscovery, globalConnectionManager, opts)
    discovery.setConnectionManager(connMgr)

    const sim = {
      discovery,
      connMgr,
      peerDiscovery,
      libp2p,
      floodSub,
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
    expect(discovery.needsConnection(a)).to.equal(true)
    expect(discovery.needsConnection(b)).to.equal(true)
    expect(discovery.needsConnection(c)).to.equal(true)
  })

  it('dials peers discovered after startup', async () => {
    const { discovery, peerDiscovery, dials } = await createDiscovery()

    // After start, emit another peer
    const d = new FakePeerInfo('d')
    peerDiscovery.emit('peer', d)

    await waitFor(50)

    // New peer should have been dialed
    expect(dials.length).to.equal(1)
    expect(discovery.needsConnection(d)).to.equal(true)
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
    expect(discovery.needsConnection(e)).to.equal(true)
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
    expect(discovery.needsConnection(f)).to.equal(true)
  })

  it('does not dial peer if discovery is interrupted by stop', async () => {
    const { discovery, peerDiscovery, dials } = await createDiscovery()

    const g = new FakePeerInfo('g')
    peerDiscovery.emit('peer', g)
    discovery.stop()

    await waitFor(50)

    // New peer should not have been dialed
    expect(dials.length).to.equal(0)
    expect(discovery.needsConnection(g)).to.equal(false)
  })

  it('repeatedly dials peer after connection error', async () => {
    let { discovery, peerDiscovery, dials } = await createDiscovery()

    peerDiscovery.emit('peer', errPeerInfo)
    await waitFor(50)

    // Peer should have been dialed repeatedly
    expect(dials.length).to.be.gte(2)
    expect(discovery.needsConnection(errPeerInfo)).to.equal(false)

    // Expect dials to stop after discovery is stopped
    discovery.stop()
    dials = []
    await waitFor(50)
    expect(dials.length).to.be.lte(1)
  })

  it('allows redial immediately after unexpected disconnect', async () => {
    const { discovery, peerDiscovery, libp2p, dials } = await createDiscovery()

    // Emit peer
    const i = new FakePeerInfo('i')
    peerDiscovery.emit('peer', i)

    await waitFor(50)

    // Peer should have been dialed
    expect(dials.length).to.equal(1)
    expect(discovery.needsConnection(i)).to.equal(true)

    // Simulate unexpected disconnect
    libp2p.emit('peer:disconnect', i)
    discovery.onUnexpectedDisconnect(i)

    // Should allow immediate redial
    await waitFor(0)
    expect(discovery.needsConnection(i)).to.equal(false)

    peerDiscovery.emit('peer', i)

    await waitFor(50)
    expect(discovery.needsConnection(i)).to.equal(true)
  })

  it('emits events for interested / not interested peers', async () => {
    let { discovery, floodSub } = await createDiscovery()

    const events = []
    discovery.on('peer:interest', (...args) => events.push(args))

    // Emit floodsub events indicating that one peer is newly interested
    // in our topic and another peer is not interested
    const a = new FakePeerInfo('a')
    const b = new FakePeerInfo('b')
    const topicsA = new Set(['some other topic'])
    const topicsB = new Set(['my app', 'some other topic'])
    floodSub.emit('floodsub:subscription-change', a, topicsA)
    floodSub.emit('floodsub:subscription-change', b, topicsB)

    await waitFor(10)

    expect(events.length).to.equal(2)
    expect(events[0][0]).to.equal(a)
    expect(events[0][1]).to.equal(false)
    expect(events[1][0]).to.equal(b)
    expect(events[1][1]).to.equal(true)
  })
})

/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const ConnectionManager = require('../../src/transport/connection-manager')
const FakePeerInfo = require('../utils/fake-peer-info')
const Dialer = require('../../src/discovery/dialer')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('connection manager', () => {
  let peerInfos
  let discovery
  let libp2p
  let dialer
  let failNextDial
  let dials
  let connectionManager
  let disconnects
  let unexpectedDisconnects

  before(async () => {
    peerInfos = {
      a: new FakePeerInfo([1, 1, 1, 1]),
      b: new FakePeerInfo([1, 1, 1, 2]),
      c: new FakePeerInfo([1, 1, 1, 3]),
      d: new FakePeerInfo([1, 1, 1, 4]),
      e: new FakePeerInfo([1, 1, 1, 5]),
      f: new FakePeerInfo([1, 1, 1, 6])
    }

    discovery = Object.assign(new EventEmitter(), {
      setConnectionManager (cm) {}
    })

    libp2p = new EventEmitter()
    const ipfs = {
      _peerInfo: new FakePeerInfo('local node'),
      _libp2pNode: libp2p
    }

    const opts = {
      dialerBackoffMinMS: 10
    }

    let dialErr = false
    failNextDial = () => {
      dialErr = true
    }
    dials = []
    dialer = new Dialer({
      dial: (peerInfo, cb) => {
        dials.push(peerInfo)
        if (dialErr) {
          dialErr = false
          return cb(new Error('dial error'), false)
        }
        setTimeout(() => cb(null, true), 10)
      }
    }, opts)

    disconnects = []
    const globalConnectionManager = {
      maybeHangUp (peerInfo) {
        disconnects.push(peerInfo)
      }
    }

    connectionManager = new ConnectionManager(ipfs, dialer, discovery, globalConnectionManager, opts)

    unexpectedDisconnects = []
    connectionManager.on('disconnect:unexpected', (peerInfo) => {
      unexpectedDisconnects.push(peerInfo)
    })

    connectionManager.start(peerInfos.a)
    await waitFor(10)
  })

  it('connects to newly interested peers', async () => {
    dials = []
    disconnects = []

    // Emit floodsub events indicating that two peers are newly interested
    // in our topic
    discovery.emit('peer:interest', peerInfos.a, true)
    discovery.emit('peer:interest', peerInfos.b, true)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.a)).to.equal(true)
    expect(connectionManager.hasConnection(peerInfos.b)).to.equal(true)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(0)
  })

  it('disconnects from no longer interested peers', async () => {
    dials = []
    disconnects = []

    // Emit floodsub events indicating that one peer is no longer interested
    discovery.emit('peer:interest', peerInfos.b, false)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.b)).to.equal(false)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(1)
  })

  it('ignores interested peers that are already in ring and not interested peers that were not in ring', async () => {
    dials = []
    disconnects = []

    // Emit floodsub events indicating that one peer we already knew about is
    // interested in our topic and another peer is new but not interested
    discovery.emit('peer:interest', peerInfos.a, true)
    discovery.emit('peer:interest', peerInfos.c, false)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.a)).to.equal(true)
    expect(connectionManager.hasConnection(peerInfos.c)).to.equal(false)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(0)
  })

  it('removes unexpectedly disconnected peer from ring', async () => {
    dials = []
    disconnects = []
    unexpectedDisconnects = []

    // Emit floodsub events indicating that a peer is newly interested
    // in our topic
    discovery.emit('peer:interest', peerInfos.d, true)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.d)).to.equal(true)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(0)

    libp2p.emit('peer:disconnect', peerInfos.d)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.d)).to.equal(false)
    expect(dials.length).to.equal(0)
    // a peer:disconnect event means peer was already disconnected so
    // we don't need to hang up
    expect(disconnects.length).to.equal(0)
    // we should fire an event indicating that an unexpected disconnect has occurred
    expect(unexpectedDisconnects.length).to.equal(1)
  })

  it('removes peer from ring if we receive a dial failure event', async () => {
    dials = []
    disconnects = []
    unexpectedDisconnects = []

    // Emit floodsub events indicating that a peer is newly interested
    // in our topic
    discovery.emit('peer:interest', peerInfos.e, true)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.e)).to.equal(true)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(0)

    // Emit dialer event indicating that peer could not be dialed
    dialer.emit('dialed', peerInfos.e, new Error('err'))

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.e)).to.equal(false)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(1)
    // we should fire an event indicating that an unexpected disconnect has occurred
    expect(unexpectedDisconnects.length).to.equal(1)
  })

  it('removes peer from ring if we dial and theres a failure', async () => {
    dials = []
    disconnects = []

    // Emit floodsub events indicating that a peer is newly interested
    // in our topic
    discovery.emit('peer:interest', peerInfos.f, true)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.f)).to.equal(true)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(0)

    // Disconnect peer
    connectionManager._disconnectPeer(peerInfos.f)
    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.f)).to.equal(false)
    expect(dials.length).to.equal(0)
    expect(disconnects.length).to.equal(1)

    // Emit peer interest which will also trigger peer f to be dialed
    failNextDial() // make dial fail
    discovery.emit('peer:interest', new FakePeerInfo([9, 9, 9, 9]), false)

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.f)).to.equal(false)
    expect(dials.length).to.equal(1)
    expect(disconnects.length).to.equal(2)
  })

  it('cleans up all connections on stop', async () => {
    connectionManager.stop()

    await waitFor(50)

    expect(connectionManager.hasConnection(peerInfos.a)).to.equal(false)
    expect(connectionManager.hasConnection(peerInfos.b)).to.equal(false)
    expect(connectionManager.hasConnection(peerInfos.c)).to.equal(false)
    expect(connectionManager.hasConnection(peerInfos.d)).to.equal(false)
    expect(connectionManager.hasConnection(peerInfos.e)).to.equal(false)
    expect(connectionManager.hasConnection(peerInfos.f)).to.equal(false)
  })
})

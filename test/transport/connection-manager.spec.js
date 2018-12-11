/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const ConnectionManager = require('../../src/transport/connection-manager')
const FakePeerInfo = require('../utils/fake-peer-info')

function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('connection manager', () => {
  let appTopic
  let peerInfos
  let discovery
  let floodSub
  let libp2p
  let connectionManager
  let resetConnectionsCalls

  before(async () => {
    appTopic = 'my topic'

    peerInfos = {
      a: new FakePeerInfo([1, 1, 1, 1]),
      b: new FakePeerInfo([1, 1, 1, 2]),
      c: new FakePeerInfo([1, 1, 1, 3]),
      d: new FakePeerInfo([1, 1, 1, 4]),
      e: new FakePeerInfo([1, 1, 1, 5])
    }

    resetConnectionsCalls = []
    discovery = Object.assign(new EventEmitter(), {
      resetConnections (diasSet) {
        resetConnectionsCalls.push(diasSet)
      }
    })

    floodSub = new EventEmitter()
    libp2p = Object.assign(new EventEmitter(), {
      _floodSub: floodSub
    })
    const ipfs = {
      _peerInfo: new FakePeerInfo('local node'),
      _libp2pNode: libp2p
    }

    const opts = {
      debounceResetConnectionsMS: 10
    }
    connectionManager = new ConnectionManager(ipfs, discovery, appTopic, opts)
    connectionManager.start(peerInfos.a)
    await waitFor(10)
  })

  it('connects to newly interested peers', async () => {
    resetConnectionsCalls = []

    // Emit floodsub events indicating that two peers are newly interested
    // in our topic
    const topicsA = new Set([appTopic, 'some other topic'])
    const topicsB = new Set(['some topic', appTopic])
    floodSub.emit('floodsub:subscription-change', peerInfos.a, topicsA)
    floodSub.emit('floodsub:subscription-change', peerInfos.b, topicsB)

    await waitFor(50)

    expect(resetConnectionsCalls.length).to.equal(1)
    const diasSet = resetConnectionsCalls[0]
    expect(diasSet.has(peerInfos.a)).to.equal(true)
    expect(diasSet.has(peerInfos.b)).to.equal(true)
  })

  it('connects to newly interested peers and disconnects from peers that are not interested', async () => {
    resetConnectionsCalls = []

    // Emit floodsub events indicating that one peer is newly interested
    // in our topic and another peer is no longer interested
    const topicsA = new Set(['some other topic'])
    const topicsC = new Set([appTopic, 'some other topic'])
    floodSub.emit('floodsub:subscription-change', peerInfos.a, topicsA)
    floodSub.emit('floodsub:subscription-change', peerInfos.c, topicsC)

    await waitFor(50)

    expect(resetConnectionsCalls.length).to.equal(1)
    const diasSet = resetConnectionsCalls[0]
    expect(diasSet.has(peerInfos.a)).to.equal(false)
    expect(diasSet.has(peerInfos.c)).to.equal(true)
  })

  it('removes disconnected peer from ring', async () => {
    resetConnectionsCalls = []

    discovery.emit('disconnect', peerInfos.b)

    await waitFor(50)

    expect(resetConnectionsCalls.length).to.equal(1)
    const diasSet = resetConnectionsCalls[0]
    expect(diasSet.has(peerInfos.b)).to.equal(false)
  })

  it('cleans up all connections on stop', async () => {
    resetConnectionsCalls = []

    connectionManager.stop()
    expect(resetConnectionsCalls.length).to.equal(1)
    const diasSet = resetConnectionsCalls[0]
    expect(diasSet.has(peerInfos.a)).to.equal(false)
    expect(diasSet.has(peerInfos.b)).to.equal(false)
    expect(diasSet.has(peerInfos.c)).to.equal(false)
    expect(diasSet.has(peerInfos.d)).to.equal(false)
    expect(diasSet.has(peerInfos.e)).to.equal(false)
  })
})

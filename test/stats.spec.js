/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const AppFactory = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')

describe('stats', function () {
  this.timeout(30000)

  const peerCount = 4

  let App
  let swarm = []
  let collaborations
  let statsChangedHandler

  before(() => {
    App = AppFactory(AppFactory.createName())
  })

  const peerIndexes = []
  for (let i = 0; i < peerCount; i++) {
    peerIndexes.push(i)
  }

  before(() => Promise.all(peerIndexes.map(() => {
    const app = App({ maxThrottleDelayMS: 1000 })
    swarm.push(app)
    return app.start()
  })))

  after(() => Promise.all(peerIndexes.map(async (peerIndex) => {
    return swarm[peerIndex] && swarm[peerIndex].stop()
  })))

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test stats collaboration', 'rga')))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  before(() => {
    return Promise.all(swarm.map((peer) => peer.app.ipfs.id())).then((ids) => {
      ids = ids.map((id) => id.id)
      collaborations.forEach((collaboration) => {
        expect(Array.from(collaboration.peers()).sort()).to.deep.equal(ids.sort())
      })
    })
  })

  it('can monitor stats', (done) => {
    const collaboration = collaborations[0]
    const peers = new Set()
    statsChangedHandler = (peerId, stats) => {
      peers.add(peerId)
      if (peers.size === peerCount) {
        collaboration.stats.removeListener('peer updated', statsChangedHandler)
        done()
      }
    }
    collaboration.stats.on('peer updated', statsChangedHandler)

    // generate some traffic
    collaboration.shared.push('a')
    collaboration.shared.push('b')
  })

  it('stats have the correct format', (done) => {
    const collaboration = collaborations[0]
    const peers = new Set()
    statsChangedHandler = (peerId, stats) => {
      expect(stats.traffic).to.be.an('object')
      expect(stats.connections).to.be.an('object')
      expect(stats.connections.inbound).to.be.a('Set')
      expect(stats.connections.inbound.size).to.be.at.least(1)
      expect(stats.connections.outbound).to.be.a('Set')
      expect(stats.connections.outbound.size).to.be.at.least(1)
      expect(stats.traffic).to.be.an('object')
      expect(stats.traffic.total).to.be.an('object')
      expect(stats.traffic.total.in).to.be.at.least(1)
      expect(stats.traffic.total.out).to.be.at.least(1)
      expect(stats.traffic.perPeer).to.be.a('Map')
      expect(stats.traffic.perPeer.size).to.be.at.least(1)
      for (let peerStats of stats.traffic.perPeer) {
        const traffic = peerStats[1]
        expect(traffic).to.be.an('object')
        expect(traffic.in).to.be.a('number')
        expect(traffic.out).to.be.a('number')
      }
      peers.add(peerId)
      if (peers.size === peerCount) {
        collaboration.stats.removeListener('peer updated', statsChangedHandler)
        done()
      }
    }
    collaboration.stats.on('peer updated', statsChangedHandler)
  })

  it('can remove listener', () => {
    const collaboration = collaborations[0]
    collaboration.stats.removeListener('peer updated', statsChangedHandler)
  })
})

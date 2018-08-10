/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const crypto = require('libp2p-crypto')
const PeerStar = require('../')
const App = require('./utils/create-app')
const A_BIT = 5000

describe('stats', function () {
  this.timeout(20000)

  const peerCount = 4

  let swarm = []
  let collaborations
  let statsChangedHandler

  for (let i = 0; i < peerCount; i++) {
    ((i) => {
      before(() => {
        const app = App({ maxThrottleDelayMS: 1000 })
        swarm.push(app)
        return app.start()
      })

      after(() => swarm[i] && swarm[i].stop())
    })(i)
  }

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test collaboration', 'rga')))
    expect(collaborations.length).to.equal(peerCount)
  })

  before((done) => {
    setTimeout(done, A_BIT)
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
      console.log('peer updated stats:', peerId, stats)
      peers.add(peerId)
      if (peers.size === peerCount) {
        done()
      }
    }
    collaboration.stats.on('peer updated', statsChangedHandler)
  })

  it('can remove listener', () => {
    const collaboration = collaborations[0]
    collaboration.stats.removeListener('peer updated', statsChangedHandler)
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })
})

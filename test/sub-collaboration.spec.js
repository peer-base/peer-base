/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const crypto = require('libp2p-crypto')
const PeerStar = require('../')
const App = require('./utils/create-app')
require('./utils/fake-crdt')
const A_BIT = 5000

describe('sub-collaboration', function () {
  this.timeout(20000)

  const peerCount = 2 // 10
  const collaborationOptions = {
    maxDeltaRetention: 0
  }

  let swarm = []
  let collaborations

  for (let i = 0; i < peerCount; i++) {
    ((i) => {
      before(() => {
        const app = App({ maxThrottleDelayMS: 0 })
        swarm.push(app)
        return app.start()
      })

      after(() => swarm[i] && swarm[i].stop())
    })(i)
  }

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test sub-collaboration', 'fake', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
  })

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  it('can create sub-collaboration', async () => {
    const collaboration = collaborations[0]
    await collaboration.sub('sub', 'fake')
  })

  it('can push operations on root collaboration', () => {
    const collaboration = collaborations[0]
    collaboration.shared.add('a')
    collaboration.shared.add('b')
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })

  it('all replicas in sync', () => {
    collaborations.forEach((collab) => {
      const value = collab.shared.value()
      expect(value).to.equal('ab')
    })
  })

  it('can push operations on sub collaboration', async () => {
    const collaboration = collaborations[0]
    const sub = await collaboration.sub('sub')
    sub.shared.add('c')
    sub.shared.add('d')
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })

  it('root collaboration still has same value', () => {
    collaborations.forEach((collab) => {
      expect(collab.shared.value()).to.equal('ab')
    })
  })

  it('all sub-collaboration replicas in sync', async () => {
    (await Promise.all(collaborations.map((collab) => collab.sub('sub', 'fake'))))
      .forEach((sub) => {
        expect(sub.shared.value()).to.equal('cd')
      })
  })

  it('can create another replica', async () => {
    const peer = App({ maxThrottleDelayMS: 1000 })
    const collaboration = await peer.app.collaborate('test sub-collaboration', 'fake', collaborationOptions)
    swarm.push(peer)
    collaborations.push(collaboration)
    await peer.app.start()
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })

  it('root collaboration still has same value', () => {
    collaborations.forEach((collab) => {
      expect(collab.shared.value()).to.equal('ab')
    })
  })

  it('can kill 3rd replica', () => {
    return swarm[peerCount].stop()
  })
})

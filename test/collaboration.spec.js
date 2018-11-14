/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const A_BIT = 19000

describe('collaboration', function () {
  this.timeout(20000)

  const peerCount = 2 // 10
  const collaborationOptions = {}

  let swarm = []
  let collaborations

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

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  it('can be created', async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test collaboration', 'gset', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  it('has all members', () => {
    return Promise.all(swarm.map((peer) => peer.app.ipfs.id())).then((ids) => {
      ids = ids.map((id) => id.id)
      collaborations.forEach((collaboration) => {
        expect(Array.from(collaboration.peers()).sort()).to.deep.equal(ids.sort())
      })
    })
  })

  it('adding another peer', async () => {
    const peer = App({ maxThrottleDelayMS: 1000 })
    swarm.push(peer)
    await peer.app.start()
    const collaboration = await peer.app.collaborate('test collaboration', 'gset', collaborationOptions)
    collaborations.push(collaboration)
    await waitForMembers(collaborations)
  })

  it('can push operation', (done) => {
    let pendingChanges = collaborations.length
    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.once('change', (change) => {
        expect(change).to.deep.equal({ add: 'a' })
        pendingChanges--
        if (!pendingChanges) {
          done()
        }
      })
    })
    const collaboration = collaborations[0]
    collaboration.shared.add('a')
  })

  it('waits a bit', (done) => {
    setTimeout(done, 2000)
  })

  it('all replicas in sync', async () => {
    const collaborations = await Promise.all(
      swarm.map(async (peer) => peer.app.collaborate('test collaboration', 'gset', collaborationOptions)))

    await Promise.all(collaborations.map(async (collab) => {
      const value = collab.shared.value()
      const valueAgain = collab.shared.value()
      expect(value === valueAgain).to.be.true()
      expect(collab.shared.value()).to.deep.equal(new Set(['a']))
    }))
  })

  it('closes peer', () => {
    return swarm[swarm.length - 1].app.stop()
  })
})

/* eslint-env mocha */
/* eslint no-console: "off" */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const AppFactory = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const waitForValue = require('./utils/wait-for-value')

describe('collaboration', function () {
  this.timeout(30000)

  const peerCount = 3
  const collaborationOptions = {}

  let App
  let swarm = []
  let collaborations

  before(() => {
    const appName = AppFactory.createName()
    App = AppFactory(appName)
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

  it('all replicas in sync', async () => {
    const collaborations = await Promise.all(
      swarm.map(async (peer) => peer.app.collaborate('test collaboration', 'gset', collaborationOptions)))

    await waitForValue(collaborations, new Set(['a']))

    await Promise.all(collaborations.map(async (collab) => {
      const value = collab.shared.value()
      const valueAgain = collab.shared.value()
      expect(value === valueAgain).to.be.true()
      expect(collab.shared.value()).to.deep.equal(new Set(['a']))
    }))
  })

  it('closes peer', () => {
    return swarm[swarm.length - 1].app.stop().catch((err) => console.error(err))
  })
})

// TODO: remove this uncaught error handler, which
// may happen when closing the app
process.on('uncaughtException', (err) => {
  if (err.message !== 'stream ended with:0 but wanted:1') {
    throw err
  }
})

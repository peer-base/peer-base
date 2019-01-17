/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const AppFactory = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const waitForValue = require('./utils/wait-for-value')
require('./utils/fake-crdt')

describe('public collaboration', function () {
  this.timeout(30000)

  const peerCount = 2 // 10

  let App
  let swarm = []
  let collaborations
  let gossips

  before(() => {
    App = AppFactory(AppFactory.createName(), { startAtPeerIndex: 3 })
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

  it('can be created', async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test public collaboration', 'fake')))
    expect(collaborations.length).to.equal(peerCount)
  })

  it('has all members', () => waitForMembers(collaborations))

  it('adding another peer', async () => {
    const peer = App({ maxThrottleDelayMS: 1000 })
    swarm.push(peer)
    await peer.app.start()
    const collaboration = await peer.app.collaborate('test public collaboration', 'fake')
    collaborations.push(collaboration)
  })

  it('waits a bit for membership to propagate', () => waitForMembers(collaborations))

  it('can push operation', async () => {
    const collaboration = await swarm[0].app.collaborate('test public collaboration', 'fake')
    collaboration.shared.add('a')
    collaboration.shared.add('b')
  })

  it('all replicas in sync', async () => {
    const collaborations = await Promise.all(
      swarm.map(async (peer) => peer.app.collaborate('test public collaboration', 'fake')))

    await waitForValue(collaborations, 'ab')
  })

  it('can get gossips', async () => {
    gossips = await Promise.all(collaborations.map((collab) => collab.gossip('gossip name')))
  })

  it('can also gossip', (done) => {
    let count = 0
    gossips.forEach((gossip) => {
      gossip.once('message', async (message, fromPeerId) => {
        expect(message).to.deep.equal(['hello', 'from', 'unencrypted'])
        count++
        if (count === peerCount) {
          clearInterval(interval)
          done()
        }
      })
    })
    const interval = setInterval(() => {
      gossips[0].broadcast(['hello', 'from', 'unencrypted'])
    }, 1000)
  })

  it('closes peer', () => {
    return swarm[swarm.length - 1].app.stop()
  })
})

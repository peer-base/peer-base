/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const waitForValue = require('./utils/wait-for-value')
require('./utils/fake-crdt')

describe('sub-collaboration', function () {
  this.timeout(30000)

  const peerCount = 2 // 10
  const collaborationOptions = {
    maxDeltaRetention: 0
  }

  let appName
  let swarm = []
  let collaborations

  before(() => {
    appName = App.createName()
  })

  const peerIndexes = []
  for (let i = 0; i < peerCount; i++) {
    peerIndexes.push(i)
  }

  peerIndexes.forEach((peerIndex) => {
    before(() => {
      const app = App(appName, { maxThrottleDelayMS: 0 })
      swarm.push(app)
      return app.start()
    })

    after(() => swarm[peerIndex] && swarm[peerIndex].stop())
  })

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test sub-collaboration', 'fake', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
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

  it('waits for convergence', () => waitForValue(collaborations, 'ab'))

  it('can push operations on sub collaboration', async () => {
    const collaboration = collaborations[0]
    const sub = await collaboration.sub('sub')
    sub.shared.add('c')
    sub.shared.add('d')
  })

  it('waits for sub-collaboration convergence', async () => {
    const subCollaborations = await Promise.all(collaborations.map((collab) => collab.sub('sub', 'fake')))
    waitForValue(subCollaborations, 'cd')
  })

  it('root collaboration still has same value', () => waitForValue(collaborations, 'ab'))

  it('can create another replica', async () => {
    const peer = App(appName, { maxThrottleDelayMS: 1000 })
    await peer.app.start()
    swarm.push(peer)
    const collaboration = await peer.app.collaborate('test sub-collaboration', 'fake', collaborationOptions)
    collaborations.push(collaboration)
  })

  it('root collaboration still has same value', () => waitForValue(collaborations, 'ab'))

  it('can kill 3rd replica', () => {
    return swarm[peerCount].stop()
  })
})

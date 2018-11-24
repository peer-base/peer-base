/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const waitForValue = require('./utils/wait-for-value')

describe('collaboration deltas', function () {
  this.timeout(30000)

  const characters = ['a', 'b']
  const moreCharacters = ['A', 'B']
  const peerCount = characters.length
  const collaborationOptions = {}

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
      const app = App(appName, { maxThrottleDelayMS: 1000 })
      swarm.push(app)
      return app.start()
    })

    after(() => swarm[peerIndex] && swarm[peerIndex].stop())
  })

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  it('can be created', async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test array collaboration', 'rga', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  it('can push concurrent operations', async () => {
    const deltaCounts = []
    const listeners = collaborations.map((collaboration, idx) => {
      const onDelta = (delta) => {
        const [added, removed, edges] = delta
        expect(added.size).to.equal(2)
        expect(added.has(null)).to.be.true()
        expect(removed.size).to.equal(0)
        expect(edges.size).to.equal(2)
        expect(edges.has(null)).to.be.true()
        deltaCounts[idx] = (deltaCounts[idx] || 0) + 1
      }
      collaboration.shared.on('delta', onDelta)
      collaboration.shared.push(characters[idx])
      return onDelta
    })

    await waitForValue(collaborations, [...characters].reverse())
    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.removeListener('delta', listeners[idx])
    })

    expect(deltaCounts.length).to.equal(peerCount)
    deltaCounts.forEach((deltaCount) => expect(deltaCount).to.equal(2))
  })

  it('can push more operations', async () => {
    const deltaCounts = []
    const listeners = collaborations.map((collaboration, idx) => {
      const onDelta = (delta) => {
        const [added, removed, edges] = delta
        added.delete(null)
        expect(added.size).to.equal(2)
        expect(removed.size).to.equal(0)
        expect(edges.size).to.equal(3)
        expect(edges.has(null)).to.be.true()
        deltaCounts[idx] = (deltaCounts[idx] || 0) + 1
      }
      collaboration.shared.on('delta', onDelta)
      collaboration.shared.push(moreCharacters[idx])
      return onDelta
    })

    await waitForValue(collaborations, [...moreCharacters, ...characters].reverse())
    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.removeListener('delta', listeners[idx])
    })
  })

  it('closes peer', () => {
    return swarm[swarm.length - 1].app.stop()
  })
})

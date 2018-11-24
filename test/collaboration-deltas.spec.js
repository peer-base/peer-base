/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const delay = require('delay')
const PeerStar = require('../')
const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const waitForValue = require('./utils/wait-for-value')

describe('collaboration deltas', function () {
  this.timeout(30000)

  const characters = ['a', 'b', 'c', 'd']
  const moreCharacters = ['A', 'B', 'C', 'D']
  const evenMoreCharacters = ['å', '∫', '©', '∂']
  const yetMoreCharacters = ['Å', 'ß', '©', '∆']

  const manyCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split('')

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
      const onDelta = (delta, fromSelf) => {
        if (!fromSelf) {
          const [added, removed, edges] = delta
          expect(added.size).to.be.most(4)
          expect(edges.size).to.be.most(4)
          deltaCounts[idx] = (deltaCounts[idx] || 0) + 1
        }
      }
      collaboration.shared.on('delta', onDelta)
      collaboration.shared.push(characters[idx])
      return onDelta
    })

    await delay(3000)

    await waitForValue(collaborations, [...characters].reverse())
    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.removeListener('delta', listeners[idx])
    })

    expect(deltaCounts.length).to.equal(peerCount)
    deltaCounts.forEach((deltaCount) => expect(deltaCount).to.be.most(3))
  })

  it('can push more operations', async () => {
    const deltaCounts = []
    const listeners = collaborations.map((collaboration, idx) => {
      const onDelta = (delta, fromSelf) => {
        if (!fromSelf) {
          const [added, removed, edges] = delta
          expect(added.size).to.be.most(5)
          expect(edges.size).to.be.most(5)
          deltaCounts[idx] = (deltaCounts[idx] || 0) + 1
        }
      }
      collaboration.shared.on('delta', onDelta)
      collaboration.shared.push(moreCharacters[idx])
      return onDelta
    })

    await delay(3000)
    await waitForValue(collaborations, [...moreCharacters, ...characters].reverse())

    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.removeListener('delta', listeners[idx])
    })

    expect(deltaCounts.length).to.equal(peerCount)
    deltaCounts.forEach((deltaCount) => expect(deltaCount).to.be.most(3))
  })

  it('can diverge further', async () => {
    const deltaCounts = []
    const listeners = collaborations.map((collaboration, idx) => {
      const onDelta = (delta, fromSelf) => {
        if (!fromSelf) {
          const [added, removed, edges] = delta
          expect(added.size).to.be.most(5)
          expect(edges.size).to.be.most(5)
          expect(edges.has(null)).to.be.true()
          deltaCounts[idx] = (deltaCounts[idx] || 0) + 1
        }
      }
      collaboration.shared.on('delta', onDelta)
      collaboration.shared.push(evenMoreCharacters[idx])
      collaboration.shared.push(yetMoreCharacters[idx])
      return onDelta
    })

    await delay(3000)

    await waitForValue(collaborations, [ 'd', 'c', 'b', 'a', 'D', 'C', 'B', 'A', '∂', '∆', '©', '©', '∫', 'ß', 'å', 'Å' ])

    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.removeListener('delta', listeners[idx])
    })

    expect(deltaCounts.length).to.equal(peerCount)
    deltaCounts.forEach((deltaCount) => expect(deltaCount).be.most(3))
  })
})

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

  const characters = ['a', 'b']
  const moreCharacters = ['A', 'B']
  const evenMoreCharacters = ['å', '∫']
  const yetMoreCharacters = ['Å', 'ß']

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
          expect(added.size).to.equal(2)
          expect(removed.size).to.equal(0)
          expect(edges.size).to.equal(2)
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
    deltaCounts.forEach((deltaCount) => expect(deltaCount).to.equal(1))
  })

  it('can push more operations', async () => {
    const deltaCounts = []
    const listeners = collaborations.map((collaboration, idx) => {
      const onDelta = (delta, fromSelf) => {
        if (!fromSelf) {
          const [added, removed, edges] = delta
          expect(added.size).to.be.most(3)
          expect(removed.size).to.equal(0)
          expect(edges.size).to.be.most(3)
          expect(edges.has(null)).to.be.true()
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
    deltaCounts.forEach((deltaCount) => expect(deltaCount).to.equal(1))
  })

  it('can diverge further', async () => {
    const deltaCounts = []
    const listeners = collaborations.map((collaboration, idx) => {
      const onDelta = (delta, fromSelf) => {
        if (!fromSelf) {
          const [added, removed, edges] = delta
          expect(added.size).to.be.most(4)
          expect(removed.size).to.equal(0)
          expect(edges.size).to.be.most(4)
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
    await waitForValue(collaborations, [...moreCharacters, ...characters].reverse().concat([evenMoreCharacters[1], yetMoreCharacters[1], evenMoreCharacters[0], yetMoreCharacters[0]]))

    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.removeListener('delta', listeners[idx])
    })

    expect(deltaCounts.length).to.equal(peerCount)
    deltaCounts.forEach((deltaCount) => expect(deltaCount).to.equal(1))
  })

  it('handles adding many more random changes', async () => {
    let expectedCharacterCount = collaborations[0].shared.value().length
    let expectedValue
    const modifications = async (collaboration, index) => {
      const characters = []
      for (let i = 0; i < 100; i ++) {
        const character = randomCharacter()
        console.log('%d: pushing', index, character)
        collaboration.shared.push(character)
        expectedCharacterCount++
        await delay(randomShortTime())
      }

      await delay(20000)

      const value = collaboration.shared.value()
      console.log('VALUE:', value)
      if (!expectedValue) {
        expectedValue = value
      } else {
        expect(value).to.deep.equal(expectedValue)
      }
    }

    await Promise.all(collaborations.map(modifications))

    expect(collaborations[0].shared.value().length).to.equal(expectedCharacterCount)

    function randomShortTime () {
      return Math.floor(Math.random() * 50)
    }

    function randomCharacter () {
      return manyCharacters[Math.floor(Math.random() * manyCharacters.length)]
    }
  })
})

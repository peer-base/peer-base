/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const delay = require('delay')
const PeerStar = require('../')
const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const debounceEvent = require('./utils/debounce-event')

describe('collaboration with random changes', function () {
  if (process.browser) {
    return
  }

  this.timeout(70000)

  const manyCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split('')

  const peerCount = 4
  const charsPerPeer = 100
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
      swarm.map((peer) => peer.app.collaborate('test random collaboration', 'rga', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  it('handles random changes', async () => {
    let expectedCharacterCount = 0
    let expectedValue
    const modifications = async (collaboration, index) => {
      for (let i = 0; i < charsPerPeer; i++) {
        const character = characterFrom(manyCharacters, i)
        collaboration.shared.push(character)
        expectedCharacterCount++
        await delay(randomShortTime())
      }

      await debounceEvent(collaboration, 'state changed', 10000)

      const value = collaboration.shared.value()
      expect(value.length).to.equal(expectedCharacterCount)
      if (!expectedValue) {
        expectedValue = value
      } else {
        expect(value.length).to.equal(expectedValue.length)
        expect(value).to.deep.equal(expectedValue)
      }
    }

    await Promise.all(collaborations.map(modifications))

    expect(collaborations[0].shared.value().length).to.equal(expectedCharacterCount)

    // validate all vector clocks are correct
    const peerIds = (await Promise.all(collaborations.map(async (collaboration) => (await collaboration.app.ipfs.id()).id))).sort()
    for (let collaboration of collaborations) {
      for (let peerId of peerIds) {
        const clock = collaboration.vectorClock(peerId)
        expect(Object.keys(clock).sort()).to.deep.equal(peerIds)
        for (let replica of peerIds) {
          expect(clock[replica]).to.equal(charsPerPeer)
        }
      }
    }

    function randomShortTime () {
      return Math.floor(Math.random() * 10)
    }

    function characterFrom (characters, index) {
      return characters[index % characters.length]
    }
  })
})

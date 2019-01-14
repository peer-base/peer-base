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
const peerToClockId = require('../src/collaboration/peer-to-clock-id')

describe('collaboration with random changes', function () {
  this.timeout(70000)

  const manyCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split('')

  const peerCount = 8 // process.browser ? 4 : 8
  const charsPerPeer = process.browser ? 20 : 100
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
    const expectedCharacterCount = charsPerPeer * collaborations.length

    const modifications = async (collaboration, i) => {
      const stateSettled = debounceEvent(collaboration, 'state changed', process.browser ? 30000 : 10000)
      for (let i = 0; i < charsPerPeer; i++) {
        const character = characterFrom(manyCharacters, i)
        collaboration.shared.push(character)
        await delay(randomShortTime())
      }

      return stateSettled
    }

    await Promise.all(collaborations.map(modifications))

    // The length of all collaborations should be the expected length
    for (let i = 0; i < collaborations.length; i++) {
      expect(collaborations[i].shared.value().length).to.equal(expectedCharacterCount)
    }

    // The value of all collaborations should be the same
    const expectedValue = collaborations[0].shared.value()
    for (const c of collaborations) {
      expect(c.shared.value()).to.eql(expectedValue)
    }

    // validate all vector clocks are correct
    const peerIds = (await Promise.all(collaborations.map(async (collaboration) => (await collaboration.app.ipfs.id()).id)))
    const peerClockKeys = peerIds.map(peerToClockId).sort()
    for (let collaboration of collaborations) {
      for (let peerId of peerIds) {
        const peerIdAsClockId = peerToClockId(peerId)
        const clock = collaboration.vectorClock(peerId)
        for (let replica of peerClockKeys) {
          if (replica !== peerIdAsClockId && clock.hasOwnProperty(replica)) {
            expect(clock[replica]).to.equal(charsPerPeer)
          }
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

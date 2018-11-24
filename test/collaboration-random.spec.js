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
const debounceEvent = require('./utils/debounce-event')

describe('collaboration with random changes', function () {
  this.timeout(60000)

  const manyCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split('')

  const peerCount = 4
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

  it('handles random changes', async () => {
    let expectedCharacterCount = 0
    let expectedValue
    const modifications = async (collaboration, index) => {
      const characters = []
      collaboration.shared.on('delta', (delta, fromSelf) => {
        if (!fromSelf) {
          console.log('%d: ', index, delta)
        }
      })
      for (let i = 0; i < 100; i ++) {
        const character = characterFrom(manyCharacters, i)
        //randomCharacter()
        // console.log('%d: pushing', index, character)
        collaboration.shared.push(character)
        expectedCharacterCount++
        await delay(randomShortTime())
      }

      await debounceEvent(collaboration, 'state changed', 10000)

      const value = collaboration.shared.value()
      // console.log('VALUE:', value)
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

    function randomShortTime () {
      return Math.floor(Math.random() * 10)
    }

    function characterFrom (characters, index) {
      return characters[index % characters.length]
    }
    function randomCharacter () {
      return manyCharacters[Math.floor(Math.random() * manyCharacters.length)]
    }
  })
})
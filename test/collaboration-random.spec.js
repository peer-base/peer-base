/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const delay = require('delay')
const PeerStar = require('../')
const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
const peerToClockId = require('../src/collaboration/peer-to-clock-id')

const debug = require('debug')('peer-base:test:collaboration-random')

describe('collaboration with random changes', function () {
  this.timeout(70000)

  const manyCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'.split('')

  const peerCount = 8 // process.browser ? 4 : 8
  const charsPerPeer = process.browser ? 20 : 100
  const collaborationOptions = {}

  let appName
  let swarm = []
  let collaborations
  let collaborationIds = new Map()

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
    await Promise.all(collaborations.map(async c => {
      const id = (await c.app.ipfs.id()).id
      collaborationIds.set(c, id)
    }))
    await waitForMembers(collaborations)
  })

  it('handles random changes', async () => {
    const expectedCharacterCount = charsPerPeer * collaborations.length
    const peerIds = [...collaborationIds.values()]
    const peerClockKeys = peerIds.map(peerToClockId).sort()

    const modifications = async (collaboration, i) => {
      const waitForCharCount = new Promise((resolve) => {
        collaboration.on('state changed', () => {
          if (collaboration.shared.value().length === expectedCharacterCount) {
            resolve()
          }
        })
      })

      for (let i = 0; i < charsPerPeer; i++) {
        const character = characterFrom(manyCharacters, i)
        collaboration.shared.push(character)
        await delay(randomShortTime())
      }

      return waitForCharCount.then(async () => {
        debug('got state changes for', collaborationIds.get(collaboration))
      })
    }

    // Wait for all the state changes to come in
    debug('waiting for state changes')
    await Promise.all(collaborations.map(modifications))
    debug('got all state changes')

    // Wait for any remaining clocks to arrive
    if (checkAllClocks()) {
      debug('all clocks up to date')
    } else {
      debug('waiting for clocks')
      let count = 0
      await Promise.all(collaborations.map(async (collaboration) => {
        const collaborationPeerId = collaborationIds.get(collaboration)
        return new Promise(resolve => {
          let complete = false
          collaboration._clocks.on('update', () => {
            if (complete) {
              return
            }
            if (checkCollaborationClocks(collaboration)) {
              complete = true
              debug('got all clocks for %s (%d / %d)', collaborationPeerId, ++count, peerCount)
              resolve()
            }
          })
        })
      }))
      debug('got all clocks for all collaborations')
    }

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
    for (let collaboration of collaborations) {
      const collaborationPeerId = collaborationIds.get(collaboration)
      const collabPeerIdAsClockId = peerToClockId(collaborationPeerId)
      for (let peerId of peerIds) {
        const clock = collaboration.vectorClock(peerId)
        for (let replica of peerClockKeys) {
          // Ignore own key because remote may not send us updates about ourself
          if (replica !== collabPeerIdAsClockId && clock.hasOwnProperty(replica)) {
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

    function checkCollaborationClocks (collaboration) {
      const collaborationPeerId = collaborationIds.get(collaboration)
      const collabPeerIdAsClockId = peerToClockId(collaborationPeerId)
      for (let peerId of peerIds) {
        const clock = Object.assign({}, collaboration.vectorClock(peerId))

        // Ignore own key because remote may not send us updates about ourself
        delete clock[collabPeerIdAsClockId]
        if (Object.keys(clock).length < peerCount - 1) {
          // debug('not enough keys')
          return false
        }
        for (let replica of peerClockKeys) {
          if (clock.hasOwnProperty(replica) && clock[replica] !== charsPerPeer) {
            return false
          }
        }
      }
      return true
    }

    function checkAllClocks () {
      for (let collaboration of collaborations) {
        if (!checkCollaborationClocks(collaboration)) {
          return false
        }
      }
      return true
    }
  })
})

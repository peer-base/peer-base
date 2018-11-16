/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
require('./utils/fake-crdt')

describe('collaboration gossip', function () {
  this.timeout(30000)

  const peerCount = 2 // 10
  const collaborationOptions = {
    maxDeltaRetention: 0
  }

  let appName
  let swarm = []
  let collaborations
  let gossips

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

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test collaboration gossip', 'fake', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  before((done) => setTimeout(done, 8000))

  before(async () => {
    gossips = await Promise.all(collaborations.map((collab) => collab.gossip('gossip name')))
  })

  it('can send and receive gossip messages', (done) => {
    const messages = []
    let peer
    gossips.forEach((gossip) => {
      let received = false
      gossip.on('message', (message, fromPeer) => {
        if (received) {
          return
        }
        received = true
        if (peer) {
          expect(fromPeer).to.be.equal(peer)
        } else {
          peer = fromPeer
        }
        messages.push(message)
        if (messages.length === peerCount) {
          for (let message of messages) {
            expect(message).to.deep.equal(['hello', 'world!'])
          }
          clearInterval(interval)
          done()
        }
      })
    })

    const interval = setInterval(() => {
      gossips[0].broadcast(['hello', 'world!'])
    }, 500)
  })
})

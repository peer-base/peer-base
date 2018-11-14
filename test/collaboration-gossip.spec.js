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
  this.timeout(20000)

  const peerCount = 2 // 10
  const collaborationOptions = {
    maxDeltaRetention: 0
  }

  let swarm = []
  let collaborations
  let gossips

  for (let i = 0; i < peerCount; i++) {
    ((i) => {
      before(() => {
        const app = App({ maxThrottleDelayMS: 1000 })
        swarm.push(app)
        return app.start()
      })

      after(() => swarm[i] && swarm[i].stop())
    })(i)
  }

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test sub-collaboration', 'fake', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  before(async () => {
    gossips = await Promise.all(collaborations.map((collab) => collab.gossip('gossip name')))
  })

  it('can send and receive gossip messages', (done) => {
    const messages = []
    let peer
    gossips.forEach((gossip) => {
      gossip.on('message', (message, fromPeer) => {
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
          done()
        }
      })
    })

    gossips[0].broadcast(['hello', 'world!'])
  })
})

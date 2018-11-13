/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
require('./utils/fake-crdt')
const A_BIT = 15000

describe('collaboration gossip', function () {
  this.timeout(2 * A_BIT)

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
  })

  before(async () => {
    gossips = await Promise.all(collaborations.map((collab) => collab.gossip('gossip name')))
  })

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
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

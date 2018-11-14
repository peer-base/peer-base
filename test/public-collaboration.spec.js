/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const App = require('./utils/create-app')
const waitForMembers = require('./utils/wait-for-members')
require('./utils/fake-crdt')
const A_BIT = 10000

describe('public collaboration', function () {
  this.timeout(A_BIT * 2)

  const peerCount = 2 // 10

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

  it('can be created', async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate('test public collaboration', 'fake')))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  it('has all members', () => {
    return Promise.all(swarm.map((peer) => peer.app.ipfs.id())).then((ids) => {
      ids = ids.map((id) => id.id)
      collaborations.forEach((collaboration) => {
        expect(Array.from(collaboration.peers()).sort()).to.deep.equal(ids.sort())
      })
    })
  })

  it('adding another peer', async () => {
    const peer = App({ maxThrottleDelayMS: 1000 })
    swarm.push(peer)
    await peer.app.start()
    const collaboration = await peer.app.collaborate('test public collaboration', 'fake')
    collaborations.push(collaboration)
  })

  it('waits a bit for membership to propagate', async () => {
    await waitForMembers(collaborations)
  })

  it('can push operation', async () => {
    const collaboration = await swarm[0].app.collaborate('test public collaboration', 'fake')
    collaboration.shared.add('a')
    collaboration.shared.add('b')
  })

  it('waits a bit', (done) => {
    setTimeout(done, 4000)
  })

  it('all replicas in sync', async () => {
    const collaborations = await Promise.all(
      swarm.map(async (peer) => peer.app.collaborate('test public collaboration', 'fake')))

    await Promise.all(collaborations.map(async (collab) => {
      expect(collab.shared.value()).to.equal('ab')
    }))
  })

  it('can get gossips', async () => {
    gossips = await Promise.all(collaborations.map((collab) => collab.gossip('gossip name')))
  })

  it('can also gossip', (done) => {
    let count = 0
    gossips.forEach((gossip) => {
      gossip.once('message', async (message, fromPeerId) => {
        expect(message).to.deep.equal(['hello', 'from', 'unencrypted'])
        count++
        if (count === peerCount) {
          clearInterval(interval)
          done()
        }
      })
    })
    const interval = setInterval(() => {
      gossips[0].broadcast(['hello', 'from', 'unencrypted'])
    }, 1000)
  })

  it('closes peer', () => {
    return swarm[swarm.length - 1].app.stop()
  })
})

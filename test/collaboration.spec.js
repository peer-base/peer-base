/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const App = require('./utils/create-app')
const Rendezvous = require('./utils/rendezvous')

const A_BIT = 15000

describe('app swarm', function () {
  this.timeout(20000)

  const peerCount = 10 // 10

  let rendezvous
  let swarm = []
  let collaborations

  before(() => {
    rendezvous = Rendezvous()
    return rendezvous.start()
  })

  after(() => rendezvous.stop())

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

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  it('can be created', async () => {
    collaborations = await Promise.all(swarm.map((peer) => peer.app.collaborate('test collaboration')))
    expect(collaborations.length).to.equal(peerCount)
  })

  it('waits a bit for membership to propagate', (done) => {
    setTimeout(done, A_BIT)
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
    const collaboration = await peer.app.collaborate('test collaboration')
    swarm.push(peer)
    collaborations.push(collaboration)
    await peer.app.start()
  })

  it('waits a bit for membership to propagate', (done) => {
    setTimeout(done, A_BIT)
  })

  it('all peers have entire membership', () => {
    return Promise.all(swarm.map((peer) => peer.app.ipfs.id())).then((ids) => {
      ids = ids.map((id) => id.id)
      collaborations.forEach((collaboration) => {
        expect(Array.from(collaboration.peers()).sort()).to.deep.equal(ids.sort())
      })
    })
  })

  it('closes peer', () => {
    return swarm[swarm.length - 1].app.stop()
  })
})

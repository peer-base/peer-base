/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
const Repo = require('./utils/repo')
const A_BIT = 19000

describe('pinner', function () {
  this.timeout(20000)

  const collaborationName = 'pinner test collab'
  const peerCount = 2 // 10
  const collaborationOptions = {}

  let swarm = []
  let pinner
  let collaborations
  let newReader
  let newReaderCollab
  let expectedValue

  for (let i = 0; i < peerCount; i++) {
    ((i) => {
      before(() => {
        const app = App({ maxThrottleDelayMS: 1000 })
        swarm.push(app)
        return app.start()
      })
    })(i)
  }

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate(collaborationName, 'gset', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
  })

  before((done) => {
    setTimeout(done, A_BIT)
  })

  it('can add a pinner to a collaboration', () => {
    pinner = PeerStar.createPinner(App.appName, {
      ipfs: {
        swarm: App.swarm,
        repo: Repo()
      }
    })
    return pinner.start()
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })

  it('peers can perform mutations', () => {
    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.add(idx)
    })
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })

  it('converges between replicas', () => {
    expectedValue = new Set()
    collaborations.forEach((collaboration, idx) => {
      expectedValue.add(idx)
    })
    collaborations.forEach((collaboration) => {
      expect(collaboration.shared.value()).to.deep.equal(expectedValue)
    })
  })

  it('stops all replicas except for pinner', () => {
    return Promise.all(swarm.map(peer => peer.stop()))
  })

  it('can start new reader', async () => {
    newReader = App({ maxThrottleDelayMS: 1000 })
    swarm.push(newReader)
    await newReader.start()
    newReaderCollab = await newReader.app.collaborate(collaborationName, 'gset', collaborationOptions)
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })

  it('new reader got state', () => {
    expect(newReaderCollab.shared.value()).to.deep.equal(expectedValue)
  })

  it('can stop new reader', () => {
    return newReader.stop()
  })

  it('can stop pinner', () => {
    return pinner.stop()
  })
})

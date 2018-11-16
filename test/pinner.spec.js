/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
const Repo = require('./utils/repo')
const waitForMembers = require('./utils/wait-for-members')
const waitForValue = require('./utils/wait-for-value')

describe('pinner', function () {
  this.timeout(30000)

  const collaborationName = 'pinner test collab'
  const peerCount = 2 // 10
  const collaborationOptions = {}

  let appName
  let swarm = []
  let pinner
  let collaborations
  let newReader
  let newReaderCollab
  let expectedValue

  before(() => {
    appName = App.createName()
  })

  for (let i = 0; i < peerCount; i++) {
    ((i) => {
      before(() => {
        const app = App(appName, { maxThrottleDelayMS: 1000 })
        swarm.push(app)
        return app.start()
      })
    })(i)
  }

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate(collaborationName, 'gset', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
    await waitForMembers(collaborations)
  })

  it('can add a pinner to a collaboration', (done) => {
    pinner = PeerStar.createPinner(appName, {
      ipfs: {
        swarm: App.swarm,
        repo: Repo()
      }
    })

    pinner.start().then(() => {
      pinner.on('collaboration started', (collaboration) => {
        expect(collaboration.name).to.equal(collaborationName)
        done()
      })
    })
  })

  it('waits for the pinner to be a part of the membership', async () => {
    await waitForMembers(collaborations.concat(await pinner.peerId()))
  })

  it('peers can perform mutations', () => {
    collaborations.forEach((collaboration, idx) => {
      collaboration.shared.add(idx)
    })
  })

  it('converges between replicas', () => {
    expectedValue = new Set()
    collaborations.forEach((collaboration, idx) => {
      expectedValue.add(idx)
    })
    return waitForValue(collaborations, expectedValue)
  })

  it('waits for pinned event', (done) => {
    let pinned = false
    collaborations.forEach((collaboration) => {
      collaboration.replication.once('pinned', () => {
        if (!pinned) {
          pinned = true
          done()
        }
      })
    })

  })

  it('stops all replicas except for pinner', () => {
    return Promise.all(swarm.map(peer => peer.stop()))
  })

  it('can start new reader', async () => {
    newReader = App(appName, { maxThrottleDelayMS: 1000 })
    swarm.push(newReader)
    await newReader.start()
    newReaderCollab = await newReader.app.collaborate(collaborationName, 'gset', collaborationOptions)
  })

  it('new reader has pinner', async () => waitForMembers([newReaderCollab, await pinner.peerId()]))

  it('new reader got state', () => waitForValue(newReaderCollab, expectedValue))

  it('can stop new reader', () => {
    return newReader.stop()
  })

  it('can stop pinner', () => {
    return pinner.stop()
  })
})

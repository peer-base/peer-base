/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const forEvent = require('p-event')
const PeerStar = require('../')
const App = require('./utils/create-app')
const Repo = require('./utils/repo')
const waitForMembers = require('./utils/wait-for-members')
const waitForValue = require('./utils/wait-for-value')

describe('replication', function () {
  this.timeout(30000)

  const collaborationName = 'replication test collab'
  const peerCount = 2 // 10
  const collaborationOptions = {}

  let appName
  let swarm = []
  let pinner
  let pinnerPeerId
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
  })

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  before(async () => {
    collaborations = await Promise.all(
      swarm.map((peer) => peer.app.collaborate(collaborationName, 'gset', collaborationOptions)))
    await waitForMembers(collaborations)
  })

  it('has no pinner peers', () => {
    collaborations.forEach((collaboration) => expect(collaboration.replication.pinnerPeers().size).to.equal(0))
  })

  it('can add a pinner to a collaboration', async () => {
    pinner = PeerStar.createPinner(appName, {
      ipfs: {
        swarm: App.swarm,
        repo: Repo()
      }
    })
    await pinner.start()
    pinnerPeerId = await pinner.peerId()

    await Promise.all(collaborations.map((collaboration) => forEvent(collaboration.replication, 'pinner joined')))

    await waitForMembers(collaborations.concat(pinnerPeerId))
  })

  it('waits for replication events', async () => {
    collaborations[0].shared.add('a')
    collaborations[0].shared.add('b')

    await Promise.all([
      (async () => {
        await forEvent(collaborations[0].replication, 'replicating')
        await forEvent(collaborations[0].replication, 'replicated')
      })(),

      (async () => {
        await forEvent(collaborations[1].replication, 'receiving')
        await forEvent(collaborations[1].replication, 'received')
      })()
    ])

    await Promise.all(collaborations.map((collaboration) => forEvent(collaboration.replication, 'pinned')))
  })

  it('current state is persisted on pinner', () => {
    collaborations.forEach((collaboration) => expect(collaboration.replication.isCurrentStatePersistedOnPinner()).to.equal(1))
  })

  it('has pinner peers', () => {
    collaborations.forEach((collaboration) => expect(collaboration.replication.pinnerPeers().size).to.equal(1))
  })

  it('converged between replicas', () => {
    waitForValue(collaborations, new Set('a', 'b'))
  })

  it('can stop pinner', async () => {
    return Promise.all([
      pinner.stop(),
      Promise.all(collaborations.map((collaboration) => forEvent(collaboration.replication, 'pinner left')))])
  })

  it('peers dont list pinner any longer after pinner stopped', () => {
    collaborations.forEach((collaboration) => expect(collaboration.replication.pinnerPeers().size).to.equal(0))
  })
})

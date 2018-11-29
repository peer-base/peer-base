/* eslint-env mocha */
'use strict'

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

  it('can add a pinner to a collaboration', async () => {
    pinner = PeerStar.createPinner(appName, {
      ipfs: {
        swarm: App.swarm,
        repo: Repo()
      }
    })
    await pinner.start()
    pinnerPeerId = await pinner.peerId()

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

  it('converged between replicas', () => {
    waitForValue(collaborations, new Set('a', 'b'))
  })

  it('can stop pinner', () => {
    return pinner.stop()
  })
})

/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const App = require('./utils/create-app')
const Repo = require('./utils/repo')
const waitForMembers = require('./utils/wait-for-members')

describe('replication', function () {
  this.timeout(60000)

  const collaborationName = 'replication test collab'
  const peerCount = 2 // 10
  const collaborationOptions = {}

  let appName
  let swarm = []
  let pinner
  let pinnerPeerId
  let collaborations
  let expectedValue

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

  it('waits for replication events', (done) => {
    let waitingForPeers = collaborations.length

    const interval = setInterval(() => {
      collaborations.forEach((collaboration, idx) => {
        collaboration.shared.add(idx)
      })
    }, 6000)

    collaborations.forEach((collaboration) => {
      let peerDone = false
      const events = {}

      const maybeDone = () => {
        if (!peerDone && events.received && events.replicated && events.pinned) {
          peerDone = true
          for (let [eventName, listener] of Object.entries(listeners)) {
            collaboration.replication.removeListener(eventName, listener)
          }
          maybeAllDone()
        }
      }

      const listenerFor = (eventName) => (peerId, clock) => {
        if (peerDone) {
          return
        }
        events[eventName] = (events[eventName] || 0) + 1
        maybeDone()
      }

      const eventNames = ['received', 'replicated', 'pinned']

      const listeners = eventNames.reduce((listeners, eventName) => {
        const listener = listenerFor(eventName)
        collaboration.replication.on(eventName, listener)
        listeners[eventName] = listener
        return listeners
      }, {})
    })

    function maybeAllDone () {
      if (--waitingForPeers === 0) {
        clearInterval(interval)
        done()
      }
    }
  })

  it('converged between replicas', () => {
    expectedValue = new Set()
    collaborations.forEach((collaboration, idx) => {
      expectedValue.add(idx)
    })
    collaborations.forEach((collaboration) => {
      expect(collaboration.shared.value()).to.deep.equal(expectedValue)
    })
  })

  it('can stop pinner', () => {
    return pinner.stop()
  })
})

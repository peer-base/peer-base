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
    let waitingForPeers = 2

    const interval = setInterval(() => {
      collaborations.forEach((collaboration, idx) => {
        collaboration.shared.add(idx)
      })
    }, 1000)

    for (const collaboration of collaborations) {
      let receiveds = 0
      let pinneds = 0
      let replications = 0
      let peerDone = false

      const maybeDone = () => {
        if (!peerDone && replications === 1 && receiveds === 1 && pinneds === 1) {
          peerDone = true
          maybeAllDone()
        }
      }

      collaboration.replication.on('received', (peerId, clock) => {
        if (peerDone) {
          return
        }
        console.log('received', peerId, clock)
        receiveds++
        maybeDone()
      })

      collaboration.replication.on('replicated', (peerId, clock) => {
        if (peerDone) {
          return
        }
        console.log('replicated', peerId, clock)
        Object.values(clock).forEach((clock) => expect(clock).to.equal(1))
        replications++
        maybeDone()
      })

      collaboration.replication.on('pinned', (peerId, clock) => {
        if (peerDone) {
          return
        }
        console.log('pinned', peerId, clock)
        Object.values(clock).forEach((clock) => expect(clock).to.equal(1))
        pinneds++
        maybeDone()
      })
    }

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

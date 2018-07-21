/* eslint-env mocha */
'use strict'

// const {
//   Worker, isMainThread, parentPort, workerData
// } = require('worker_threads');

// if (!isMainThread) {

//   return
// }

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const crypto = require('libp2p-crypto')
const PeerStar = require('../../')
const App = require('../utils/create-app')
const A_BIT = 20000

const peerCount = 5
const duration = 20000

describe('sub-collaboration', function () {
  this.timeout(duration * 2)


  let swarm = []
  let collaborations
  let opCount = 0
  const collaborationOptions = {}

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
      swarm.map((peer) => peer.app.collaborate('array', 'rga', collaborationOptions)))
    expect(collaborations.length).to.equal(peerCount)
  })

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  it('do one operation per second on each peer', (done) => {
    console.log('Starting test...')
    const intervalMS = Math.round(1000 / peerCount)
    const interval = setInterval(() => {
      const peerIndex = opCount % peerCount
      const replica = collaborations[peerIndex]
      replica.shared.push(++opCount)
      process.stdout.write('.')
    }, intervalMS)

    setTimeout(() => {
      console.log('\nDone.\nDid %s operations', opCount)
      clearInterval(interval)
      done()
    }, duration)
  })

  it('waits a bit', (done) => {
    setTimeout(done, A_BIT)
  })

  it('all replicas are in sync', () => {
    let first
    const allResults = []
    collaborations.forEach((collaboration) => {
      const value = collaboration.shared.value()
      expect(value.length).to.equal(opCount)
      console.log('result:', value)
      if (!first) {
        first = value
      } else {
        expect(value).to.deep.equal(first)
      }
      allResults.push(value)
    })
  })
})

function array (opCount) {
  const arr = new Array(opCount)
  for (let i = 0; i < opCount; i++) {
    arr[i] = i + 1
  }
  return arr
}

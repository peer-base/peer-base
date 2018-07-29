/* eslint-env mocha */
'use strict'

const path = require('path')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const { fork } = require('child_process')

const PeerStar = require('../../')

const enableDebug = false

const server = process.argv[3] || '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star'
const replicaCount = Number(process.argv[4]) || 20 // 10
const collaborationName = 'seed-array'
const seedDatumCount = 20

console.log('Going to use websocket-star server at address %s', server)
console.log('Going to use 1 seed and %d replicas', replicaCount)

describe('performance tests - one seed, many replicas', function () {
  this.timeout(60 * 1000 * replicaCount) // one minute each

  let seed
  let workers = []
  const workerData = {
    collaborationName,
    expectedLength: seedDatumCount,
    enableDebug,
    server
  }

  before(async () => {
    workerData.keys = PeerStar.keys.uriEncode(await PeerStar.keys.generate())
  })

  after(() => {
    workers.forEach((worker) => worker.kill('SIGKILL'))
  })

  after(() => {
    if (seed) {
      seed.kill('SIGKILL')
    }
  })

  it('starts seeds', (done) => {
    const data = dataForSeed()
    const seedData = Object.assign({}, workerData, {
      data,
      workerId: 'seed',
      opsPerSecond: seedDatumCount
    })
    seed = fork(
      path.join(__dirname, 'replica.js'), [JSON.stringify(seedData)])

    seed.on('message', (message) => {
      console.log('seed is done creating', message.length)
      expect(message.length).to.equal(seedDatumCount)
      done()
    })
  })

  it('starts replicas', (done) => {
    const started = Date.now()
    const workerResults = []
    const interval = setInterval(() => {
      const resultsIn = workerResults.length
      const missingResults = replicaCount - resultsIn
      if (missingResults) {
        console.log('still missing results from %d replicas...', missingResults)
      }
    }, 1000)

    for (let i = 0; i < replicaCount; i++) {
      ((i) => {
        const thisWorkerData = Object.assign({}, workerData, {
          workerId: i
        })
        const worker = fork(
          path.join(__dirname, 'replica.js'), [JSON.stringify(thisWorkerData)])

        workers.push(worker)
        worker.on('message', (message) => {
          console.log('worker %d message length:', i, message.length)
          workerResults.push(message)
          if (workerResults.length === replicaCount) {
            clearInterval(interval)
            testWorkerResults()
            const stopped = Date.now()
            const elapsedSeconds = Math.round((stopped - started) / 1000)
            setTimeout(() => {
              console.log('Convergence reached for %d replicas in %d seconds', replicaCount, elapsedSeconds)
            }, 3000)
            done()
          }
        })
      })(i)
    }

    function testWorkerResults () {
      workerResults.forEach((workerResult, index) => {
        console.log('%d has %d entries', index, workerResult.length)
        expect(workerResult.length).to.equal(seedDatumCount)
      })
      expect(workerResults.length).to.equal(replicaCount)
    }
  })
})

function dataForSeed () {
  return array(seedDatumCount)
}

function array (opCount) {
  const arr = new Array(opCount)
  for (let i = 0; i < opCount; i++) {
    arr[i] = i + 1
  }
  return arr
}

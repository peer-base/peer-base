/* eslint-env mocha */
/* eslint no-console: "off" */
'use strict'

const path = require('path')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const { fork } = require('child_process')

const PeerStar = require('../../')

const server = process.argv[3] || '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star'
const peerCount = Number(process.argv[4]) || 10

const enableDebug = false
const duration = 20000
const collaborationName = 'array'
const opsPerSecond = 1

console.log('Going to use websocket-star server at address %s', server)
console.log('Going to use %d replicas', peerCount)

describe('performance tests - one collaboration, many peers', function () {
  this.timeout(duration * 100)

  const expectedLength = peerCount * opsPerSecond * Math.round(duration / 1000)

  let workers = []
  const workerData = {
    opsPerSecond,
    collaborationName,
    expectedLength,
    enableDebug,
    server
  }

  before(async () => {
    workerData.keys = PeerStar.keys.uriEncode(await PeerStar.keys.generate())
  })

  after(() => {
    workers.forEach((worker) => worker.kill('SIGKILL'))
  })

  it('starts replicas', (done) => {
    let started = Date.now()
    const workerResults = []
    for (let i = 0; i < peerCount; i++) {
      ((i) => {
        const data = dataForWorker(i)
        const thisWorkerData = Object.assign({}, workerData, {
          data,
          workerId: i
        })
        const worker = fork(
          path.join(__dirname, 'replica.js'), [
            JSON.stringify(thisWorkerData)]
          // {
          //   // stdio: [0, 1, ignoreWorkerStdErr ? 'ignore' : 2, 'ipc']
          // }
        )

        workers.push(worker)
        worker.on('message', (message) => {
          console.log('worker %d message length:', i, message.length)
          workerResults.push(message)
          if (workerResults.length === peerCount) {
            testWorkerResults()
            const stopped = Date.now()
            const elapsedSeconds = Math.round((stopped - started) / 1000)
            console.log('Convergence for %d replicas reached in %d seconds', peerCount, elapsedSeconds)
            done()
          }
        })
      })(i)
    }

    function testWorkerResults () {
      workerResults.forEach((workerResult, index) => {
        console.log('%d has %d entries', index, workerResult.length)
        expect(workerResult.length).to.equal(expectedLength)
      })
      expect(workerResults.length).to.equal(peerCount)
    }
  })
})

function dataForWorker (n) {
  const opCount = Math.round(duration / 1000) * opsPerSecond
  const arr = new Array(opCount)
  for (let i = 0; i < opCount; i++) {
    arr[i] = (n * opCount) + i + 1
  }

  return arr
}

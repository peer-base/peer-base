/* eslint-env mocha */
'use strict'

const path = require('path')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const crypto = require('libp2p-crypto')
const { fork } = require('child_process')

const PeerStar = require('../../')

const ignoreWorkerStdErr = false
const enableDebug = true
const peerCount = 7 // 10
const duration = 10000
const collaborationName = 'array'
const opsPerSecond = 1

describe('performance tests - one collaboration, many peers', function () {
  this.timeout(duration * 10)

  const expectedLength = peerCount * opsPerSecond * Math.round(duration / 1000)

  let workers = []
  let opCount = 0
  const workerData = {
    opsPerSecond,
    collaborationName,
    expectedLength,
    enableDebug
  }

  before(async () => {
    workerData.keys = PeerStar.keys.uriEncode(await PeerStar.keys.generate())
  })

  after(() => {
    workers.forEach((worker) => worker.kill('SIGKILL'))
  })

  it('starts replicas', (done) => {
    const workerResults = []
    for(let i = 0; i < peerCount; i++) {
      ((i) => {
        const data = dataForWorker(i)
        const thisWorkerData = Object.assign({}, workerData, {
          data,
          workerId: i
        })
        const worker = fork(
          path.join(__dirname, 'replica.js'), [
          JSON.stringify(thisWorkerData)],
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

function array (opCount) {
  const arr = new Array(opCount)
  for (let i = 0; i < opCount; i++) {
    arr[i] = i + 1
  }
  return arr
}

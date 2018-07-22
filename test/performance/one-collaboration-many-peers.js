/* eslint-env mocha */
'use strict'

const path = require('path')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const crypto = require('libp2p-crypto')
const { fork } = require('child_process')

const PeerStar = require('../../')
const A_BIT = 20000

const peerCount = 5
const duration = 20000
const coolDownTimeMS = peerCount * 5000
const collaborationName = 'array'
const opsPerSecond = 1

describe('performance tests - one collaboration, many peers', function () {
  this.timeout(duration * 2 + coolDownTimeMS)

  const expectedLength = peerCount * opsPerSecond * Math.round(duration / 1000)

  let workers = []
  let opCount = 0
  const workerData = {
    opsPerSecond,
    coolDownTimeMS,
    collaborationName
  }

  before(async () => {
    workerData.keys = PeerStar.keys.uriEncode(await PeerStar.keys.generate())
  })

  it('starts replicas', () => {
    const workers = []
    const workerResults = []
    for(let i = 0; i < peerCount; i++) {
      ((i) => {
        const data = dataForWorker(i)
        const thisWorkerData = Object.assign({}, workerData, { data })
        const worker = fork(
          path.join(__dirname, 'replica.js'), [
          JSON.stringify(thisWorkerData)],
          {
            stdio: [0, 1, 2, 'ipc']
          })

        workers.push(new Promise((resolve, reject) => {
          worker.once('exit', (code) => {
            if (code !== 0) {
              return reject(new Error(`Worker stopped with exit code ${code}`));
            }
            resolve()
          })
          worker.on('message', (message) => {
            console.log('worker %d message:', i, message)
            workerResults.push(message)
            if (workerResults.length === peerCount) {
              testWorkerResults()
            }
          })
        }))
      })(i)
    }

    return Promise.all(workers)

    function testWorkerResults () {
      workerResults.forEach((workerResult) => {
        expect(workerResult.length).to.equal(expectedLength)
      })
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

/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const App = require('./utils/create-app')

const A_BIT = 19000

describe('app swarm', function () {
  this.timeout(30000)

  let appName
  const peerCount = 10

  // let rendezvous
  let swarm = []
  const outboundConnectionCounts = []
  const inboundConnectionCounts = []
  let interval

  before(() => {
    interval = setInterval(() => {
      console.log('outbound connection counts:', outboundConnectionCounts)
      console.log('inbound connection counts:', inboundConnectionCounts)
    }, 1000)
  })

  after(() => clearInterval(interval))

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

      app.app.on('outbound peer connected', (peerInfo) => {
        outboundConnectionCounts[peerIndex] = (outboundConnectionCounts[peerIndex] || 0) + 1
      })

      app.app.on('inbound peer connected', (peerInfo) => {
        inboundConnectionCounts[peerIndex] = (inboundConnectionCounts[peerIndex] || 0) + 1
      })

      app.app.on('outbound peer disconnected', (peerInfo) => {
        outboundConnectionCounts[peerIndex] = (outboundConnectionCounts[peerIndex] || 0) - 1
      })

      app.app.on('inbound peer disconnected', (peerInfo) => {
        inboundConnectionCounts[peerIndex] = (inboundConnectionCounts[peerIndex] || 0) - 1
      })

      swarm.push(app)
      return app.start()
    })

    after(() => swarm[peerIndex] && swarm[peerIndex].stop())
  })

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  it('broadcasting eventually reaches all nodes', (done) => {
    console.log('---- 1')
    let missing = peerCount
    swarm.forEach(({ app }, index) => app.once('gossip', (message) => {
      expect(message.from).to.equal(swarm[0].app.ipfs._peerInfo.id.toB58String())
      expect(JSON.parse(message.data.toString())).to.equal('hello world!')
      console.log('gossip in %d: %j', index, message.data.toString())
      missing--
      if (!missing) {
        done()
      }
    }))

    swarm[0].app.gossip(Buffer.from(JSON.stringify('hello world!')))
  })

  it('each node connections are bounded', () => {
    outboundConnectionCounts.forEach((connCount) => {
      expect(connCount).to.be.most(10)
    })
    inboundConnectionCounts.forEach((connCount) => {
      expect(connCount).to.be.most(10)
    })
  })
})

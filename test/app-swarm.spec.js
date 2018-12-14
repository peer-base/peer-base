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

  function getOutboundConnectionCount (peer) {
    const libp2pNode = peer.app.ipfs._libp2pNode
    if (!libp2pNode) return 0
    const discovery = (libp2pNode._discovery || [])[0]
    if (!discovery || !discovery._connectionManager) return 0
    return [...discovery._connectionManager.connections.values()].length
  }

  let interval

  // before(() => {
  //   interval = setInterval(() => {
  //     console.log('outbound connection counts:', swarm.map(a => getOutboundConnectionCount(a)))
  //   }, 1000)
  // })

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
    // console.log('---- 1')
    let missing = peerCount
    swarm.forEach(({ app }, index) => app.once('gossip', (message) => {
      expect(message.from).to.equal(swarm[0].app.ipfs._peerInfo.id.toB58String())
      expect(JSON.parse(message.data.toString())).to.equal('hello world!')
      // console.log('gossip in %d: %j', index, message.data.toString())
      missing--
      if (!missing) {
        done()
      }
    }))

    swarm[0].app.gossip(Buffer.from(JSON.stringify('hello world!')))
  })

  it('each node connections are bounded', () => {
    swarm.forEach((peer) => {
      expect(getOutboundConnectionCount(peer)).to.be.most(10)
    })
  })
})

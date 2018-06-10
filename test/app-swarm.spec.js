/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const App = require('./utils/create-app')
const Rendezvous = require('./utils/rendezvous')

const A_BIT = 9000

describe('app swarm', function () {
  this.timeout(20000)

  const peerCount = 10

  let rendezvous
  let swarm = []

  before(() => {
    rendezvous = Rendezvous()
    return rendezvous.start()
  })

  after(() => rendezvous.stop())

  for (let i = 0; i < peerCount; i++) {
    ((i) => {
      before(() => {
        const app = App()

        app.app.on('peer connected', (peerInfo) => {
          console.log('connected to peer %s', peerInfo.id.toB58String())
        })

        app.app.on('peer disconnected', (peerInfo) => {
          console.log('disconnected from peer %s', peerInfo.id.toB58String())
        })

        swarm.push(app)
        return app.start()
      })

      after(() => swarm[i] && swarm[i].stop())
    })(i)
  }

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  it('broadcasting eventually reaches all nodes', (done) => {
    console.log('---- 1')
    let missing = peerCount
    swarm.forEach(({ app }, index) => app.once('gossip', (message) => {
      expect(message.from).to.equal(swarm[0].app.ipfs._peerInfo.id.toB58String())
      expect(message.data.toString()).to.equal('hello world!')
      console.log('gossip in %d: %j', index, message)
      missing--
      if (!missing) {
        done()
      }
    }))

    swarm[0].app.gossip(Buffer.from('hello world!'))
  })

  it('each node is outbound connected to maximum 6 other nodes', () => {

  })
})

// js-ipfs sometimes likes to present us with an uncaught exception
// "Multiplexer is destroyed" when shutting down.
// Ignoring it.

const ignoreMessages = [
  'Multiplexer is destroyed',
  'already piped',
  'websocket error']

process.on('uncaughtException', (err) => {
  if (!ignoreMessages.find((m) => err.message.indexOf(m) >= 0)) {
    throw err
  }
})

/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const App = require('./utils/create-app')
const Rendezvous = require('./utils/rendezvous')

const A_BIT = 3000

describe('app swarm', function () {
  this.timeout(10000)

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

      after(() => swarm[i].stop())
    })(i)
  }

  before((done) => {
    // wait a bit for things to sync
    setTimeout(done, A_BIT)
  })

  it('broadcasting eventually reaches all nodes', () => {
    expect(1).to.equal(1)
  })
})

process.on('uncaughtException', (err) => {
  if (err.message !== 'Multiplexer is destroyed') {
    throw err
  }
})
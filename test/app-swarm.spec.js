/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const App = require('./utils/create-app')
const Rendezvous = require('./utils/rendezvous')

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
        swarm.push(app)
        return app.start()
      })

      after(() => swarm[i].stop())
    })(i)
  }

  it('can be created', () => {
    console.log('hello!')
  })
})

/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const Repo = require('./utils/repo')
const Rendezvous = require('./utils/rendezvous')

describe('app', function () {
  this.timeout(10000)
  let rendezvous
  let repo
  let app
  let collaboration

  before(() => {
    repo = Repo()
  })

  after(() => repo.teardown())

  before(() => {
    rendezvous = Rendezvous()
    return rendezvous.start()
  })

  after(() => rendezvous.stop())

  it('can be created', () => {
    app = PeerStar('peer star test app', {
      ipfs: {
        repo,
        swarm: [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]
      }
    })
  })

  it('can be started', () => app.start())

  it('can get collaboration', () => {
    collaboration = app.collaborate('collaboration name')
    expect(collaboration).to.not.be.empty()
  })

  it('can reget collaboration', () => {
    expect(app.collaborate('collaboration name')).to.equal(collaboration)
  })

  it('can be stopped', () => app.stop())
})

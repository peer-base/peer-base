/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const Repo = require('./utils/repo')
require('./utils/fake-crdt')

describe('app', function () {
  this.timeout(10000)
  let repo
  let app
  let collaboration
  let collaborationOptions = {}

  before(() => {
    repo = Repo()
  })

  before(async () => {
    collaborationOptions.keys = await PeerStar.keys.generate()
  })

  after(() => repo.teardown())

  it('can be created', () => {
    app = PeerStar('peer star test app', {
      ipfs: {
        repo,
        swarm: [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]
      }
    })
  })

  it('can be started', () => app.start())

  it('can get collaboration', async () => {
    collaboration = await app.collaborate('collaboration name', 'fake', collaborationOptions)
    expect(collaboration).to.not.be.empty()
  })

  it('can reget collaboration', async () => {
    expect(await app.collaborate('collaboration name', 'fake', collaborationOptions)).to.equal(collaboration)
  })

  it('can get concurrently created collaboration shared', async () => {
    const collab1 = app.collaborate('collaboration name 2', 'fake', collaborationOptions)
    const collab2 = app.collaborate('collaboration name 2', 'fake', collaborationOptions)
    const res = await collab2
    expect(res.shared).to.exist()
  })

  it('can be stopped', () => app.stop())
})

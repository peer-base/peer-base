/* eslint-env mocha */
'use strict'

const hat = require('hat')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const PeerStar = require('../')
const Repo = require('./utils/repo')

describe('app', function () {
  this.timeout(10000)
  let repo
  let app

  before(() => {
    repo = Repo()
  })

  after((done) => repo.teardown(done))

  it('can be created', () => {
    app = PeerStar('peer star test app', {
      ipfs: { repo }
    })
  })

  it('can be started', () => app.start())

  it('can be stopped', () => app.stop())
})

/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const FakePeerInfo = require('./utils/fake-peer-info')
const randomPeerId = require('./utils/random-peer-id').buffer
const Membership = require('../src/collaboration/membership')

describe('membership', () => {
  let app
  let ipfs
  let globalConnectionManager
  let collaboration
  let store
  let clocks
  let options

  let membership

  let peerCount = 10

  before(() => {
    ipfs = {
      _peerInfo: new FakePeerInfo(randomPeerId()),
      id () {
        return Promise.resolve(this._peerInfo.id.toB58String())
      }
    }
    globalConnectionManager = {
      handle (protocolName, handler) {

      },
      unhandle (protocolName) {

      }
    }
    app = {
      peerCountGuess () {
        return 1
      },
      gossip (message) {

      }
    }
    collaboration = {
      name: 'collab name',
      typeName: 'gset'
    }
    store = {}
    clocks = {}
    options = {
      peerIdByteCount: 32,
      preambleByteCount: 2,
      keys: {}
    }
  })

  after(() => {
    if (membership) {
      return membership.stop()
    }
  })

  it('can be created', () => {
    membership = new Membership(ipfs, globalConnectionManager, app, collaboration, store, clocks, options)
  })

  it('can be started', () => membership.start())

  it('does something', function () {
  })
})

/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const EventEmitter = require('events')
const pair = require('pull-pair')

const Protocol = require('../src/collaboration/protocol')

describe('collaboration protocol', function () {
  let pusher = {}
  let puller = {}

  it('pusher can be created', () => {
    const collaboration = { name: 'collaboration protocol test' }
    const store = Object.assign(new EventEmitter(), {
      _latestVectorClock: {},
      getLatestVectorClock() {
        return this._latestVectorClock
      },
      setLatestVectorClock (vc) {
        this._latestVectorClock = vc
      }
    })
    pusher.protocol = Protocol(collaboration, store)
  })

  it('puller can be created', () => {
    const collaboration = { name: 'collaboration protocol test' }
    const store = Object.assign(new EventEmitter(), {
      _latestVectorClock: {},
      getLatestVectorClock() {
        return this._latestVectorClock
      },
      setLatestVectorClock (vc) {
        this._latestVectorClock = vc
      }
    })
    puller.protocol = Protocol(collaboration, store)
  })

  it('can connect pusher and puller', () => {
    const p1 = pair()
    const p2 = pair()

    const pullerStream = {
      source: p1.source,
      sink: p2.sink,
      getPeerInfo() {
        return 'pusher'
      }
    }

    const pusherStream = {
      source: p2.source,
      sink: p1.sink
    }

    pusher.protocol.dialerFor('puller', pusherStream)
    puller.protocol.handler(null, pullerStream)
  })
})

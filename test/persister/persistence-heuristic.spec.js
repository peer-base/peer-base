/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const fail = (msg) => expect.fail(null, null, msg)

const EventEmitter = require('events')
const PersistenceHeuristic = require('../../src/persister/persistence-heuristic')

describe('persistence heuristic', function () {
  before(async () => {
  })

  it('persistence heuristic fires snapshot event after each snapshot interval', async () => {
    const deltaCountEmitter = new EventEmitter()
    const options = {
      samplingIntervalMS: 0,
      maxSnapshotIntervalMS: 50
    }

    let snapshots = 0
    let firstAt
    const onSnapshot = () => {
      firstAt = firstAt || Date.now()
      snapshots++
    }
    const ph = new PersistenceHeuristic(deltaCountEmitter, options)
    ph.on('snapshot', onSnapshot)
    ph.start()
    await new Promise(resolve => setTimeout(resolve, 275))
    expect(firstAt).to.exist()
    const expectedCount = Math.floor((Date.now() - firstAt) / options.maxSnapshotIntervalMS)
    expect(snapshots).to.be.gte(expectedCount)
  })

  it('persistence heuristic fires snapshot when delta count exceeds maxDeltas', (done) => {
    const deltaCountEmitter = new EventEmitter()
    const options = {
      maxDeltas: 3
    }

    let snapshots = 0
    let firstAt
    const onSnapshot = () => {
      firstAt = firstAt || Date.now()
      snapshots++
    }
    const ph = new PersistenceHeuristic(deltaCountEmitter, options)
    ph.on('snapshot', onSnapshot)
    ph.start()
    deltaCountEmitter.emit('branch delta count', 1)
    deltaCountEmitter.emit('branch delta count', 2)
    deltaCountEmitter.emit('branch delta count', 3)
    // Fire snapshot
    deltaCountEmitter.emit('branch delta count', 4)

    // Fire snapshot
    deltaCountEmitter.emit('branch delta count', 10)

    setTimeout(() => {
      expect(snapshots).to.equal(2)
      done()
    }, 0)
  })

  it('persistence heuristic does not fire events before starting', (done) => {
    const deltaCountEmitter = new EventEmitter()
    const options = {
      samplingIntervalMS: 1,
      maxDeltas: 1,
      maxSnapshotIntervalMS: 1
    }

    const onBeforeStartSnapshot = () => fail('No events should be fired before start')
    const ph = new PersistenceHeuristic(deltaCountEmitter, options)
    ph.on('snapshot', onBeforeStartSnapshot)
    deltaCountEmitter.emit('branch delta count', 10)
    deltaCountEmitter.emit('branch delta count', 10)
    deltaCountEmitter.emit('branch delta count', 10)
    setTimeout(done, 50)
  })

  it('persistence heuristic does not fire events after stopping', (done) => {
    const deltaCountEmitter = new EventEmitter()
    const options = {
      samplingIntervalMS: 1,
      maxDeltas: 1,
      maxSnapshotIntervalMS: 1
    }

    const onAfterStopSnapshot = () => fail('No events should be fired after stop')
    const ph = new PersistenceHeuristic(deltaCountEmitter, options)
    ph.start()
    setTimeout(() => {
      ph.stop()
      ph.on('snapshot', onAfterStopSnapshot)
      deltaCountEmitter.emit('branch delta count', 10)
      deltaCountEmitter.emit('branch delta count', 10)
      deltaCountEmitter.emit('branch delta count', 10)
      setTimeout(done, 50)
    }, 50)
  })
})

process.on('unhandledRejection', (err) => {
  console.error(err)
})

'use strict'

const debug = require('debug')('peer-star:persister:heuristic')
const EventEmitter = require('events')

const defaultOptions = {
  samplingIntervalMS: 1000,
  maxDeltas: 100,
  maxSnapshotIntervalMS: 5 * 60 * 1000
}

// TODO: Share code with membership-gossip-frequency-heuristic
module.exports = class PersistenceHeuristic extends EventEmitter {
  constructor (deltaCountEmitter, options) {
    super()

    this._options = Object.assign({}, defaultOptions, options)
    this._deltaCountEmitter = deltaCountEmitter

    this._onDeltaCountChange = this._onDeltaCountChange.bind(this)
    this._sample = this._sample.bind(this)
  }

  start () {
    debug('Starting heuristic')
    this._deltaCountEmitter.on('branch delta count', this._onDeltaCountChange)
    this._lastFired = Date.now()
    this._samplingInterval = setInterval(this._sample.bind(this), this._options.samplingIntervalMS)
  }

  stop () {
    this._deltaCountEmitter.removeListener('branch delta count', this._onDeltaCountChange)
    clearInterval(this._samplingInterval)
    this._samplingInterval = null
    debug('Stopped heuristic')
  }

  _onDeltaCountChange (count) {
    debug('branch delta count', count)
    if (count > this._options.maxDeltas) {
      debug('Firing snapshot event - branch delta count %d > max deltas %d', count, this._options.maxDeltas)
      this._fireEvent()
    }
  }

  _sample () {
    const elapsed = Date.now() - this._lastFired
    if (elapsed > this._options.maxSnapshotIntervalMS) {
      debug('Firing snapshot event - elapsed time %d > snapshot interval %d', elapsed, this._options.maxSnapshotIntervalMS)
      this._fireEvent()
    }
  }

  _fireEvent () {
    this._lastFired = Date.now()
    this.emit('snapshot')
  }
}

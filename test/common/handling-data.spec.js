/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const handlingData = require('../../src/common/handling-data')
const { encode } = require('delta-crdts-msgpack-codec')

describe('handling data', () => {
  it('correctly decodes data', (done) => {
    const sample = 'my data'
    const fn = handlingData((err, data) => {
      expect(data).to.equal(sample)
      done()
    })
    fn(encode(sample))
  })

  it('sets error argument if the data is incorrectly encoded', (done) => {
    const fn = handlingData((err, data) => {
      expect(err).to.be.defined
      done()
    })
    fn('not encoded')
  })

  it('sets error argument if the handler function throws an error', (done) => {
    const sample = 'my data'
    const fn = handlingData((err, data) => {
      if (!err) throw new Error('testing exception handling')

      expect(err).to.be.defined
      done()
    })
    fn(encode(sample))
  })
})

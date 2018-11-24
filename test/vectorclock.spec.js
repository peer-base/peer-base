/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const vectorclock = require('../src/common/vectorclock')

describe('vectorclock', () => {
  describe('isDeltaInteresting', () => {
    it('accepts one up', () => {
      const delta = [{}, { a: 1 }]
      const currentClock = {}
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept already included', () => {
      const delta = [{}, { a: 1 }]
      const currentClock = { a: 1 }
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.false()
    })

    it('accepts many up', () => {
      const delta = [{}, { a: 2 }]
      const currentClock = { a: 1 }
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept already included', () => {
      const delta = [{}, { a: 1 }]
      const currentClock = { a: 2 }
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.false()
    })


    it('accepts concurrent that starts from inside', () => {
      const delta = [{ a: 1}, { a: 1 }]
      const currentClock = { b: 1, a: 1 }
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept concurrent that starts from outside', () => {
      const delta = [{ a: 1}, { a: 1 }]
      const currentClock = { b: 1 }
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.false()
    })

    it('accepts concurrent that starts from inside and expands multiple', () => {
      const delta = [{ a: 1}, { a: 2 }]
      const currentClock = { b: 1, a: 1 }
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept concurrent that starts from inside and ends in self', () => {
      const delta = [{ b: 1}, { b: 1 }]
      const currentClock = { b: 2 }
      expect(vectorclock.isDeltaInteresting(delta, currentClock)).to.be.false()
    })

  })
})

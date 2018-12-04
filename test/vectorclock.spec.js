/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const vectorclock = require('../src/common/vectorclock')
const {
  doesSecondHaveFirst,
  increment,
  isDeltaInteresting,
  isIdentical
} = vectorclock

describe('vectorclock', () => {
  describe('doesSecondHaveFirst', () => {
    it('empty', () => {
      expect(doesSecondHaveFirst({}, {})).to.be.true()
    })

    it('first empty second full', () => {
      expect(doesSecondHaveFirst({}, { a: 1 })).to.be.true()
    })

    it('second empty first full', () => {
      expect(doesSecondHaveFirst({ a: 1 }, {})).to.be.false()
    })

    it('first same as second', () => {
      expect(doesSecondHaveFirst({ a: 1 }, { a: 1, b: 2 })).to.be.true()
    })

    it('first lower value than second', () => {
      expect(doesSecondHaveFirst({ a: 1, b: 3 }, { a: 2, b: 3 })).to.be.true()
    })

    it('first some lower some higher than second', () => {
      expect(doesSecondHaveFirst({ a: 2, b: 2 }, { a: 1, b: 3 })).to.be.false()
    })
  })

  describe('increment', () => {
    it('empty', () => {
      expect(increment({})).to.eql({})
    })

    it('undefined', () => {
      expect(increment()).to.eql({})
    })

    it('null', () => {
      expect(increment(null)).to.eql({})
    })

    it('with no author has no effect', () => {
      expect(increment({ a: 1 })).to.eql({ a: 1 })
    })

    it('empty with author', () => {
      expect(increment({}, 'a')).to.eql({ a: 1 })
    })

    it('with author not in clock', () => {
      expect(increment({ b: 3 }, 'a')).to.eql({ a: 1, b: 3 })
    })

    it('with author', () => {
      expect(increment({ a: 4, b: 3 }, 'a')).to.eql({ a: 5, b: 3 })
    })
  })

  describe('isDeltaInteresting', () => {
    it('accepts one up', () => {
      const delta = [{}, { a: 1 }]
      const currentClock = {}
      expect(isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept already included', () => {
      const delta = [{}, { a: 1 }]
      const currentClock = { a: 1 }
      expect(isDeltaInteresting(delta, currentClock)).to.be.false()
    })

    it('accepts many up', () => {
      const delta = [{}, { a: 2 }]
      const currentClock = { a: 1 }
      expect(isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept already included', () => {
      const delta = [{}, { a: 1 }]
      const currentClock = { a: 2 }
      expect(isDeltaInteresting(delta, currentClock)).to.be.false()
    })

    it('accepts concurrent that starts from inside', () => {
      const delta = [{ a: 1 }, { a: 1 }]
      const currentClock = { b: 1, a: 1 }
      expect(isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept concurrent that starts from outside', () => {
      const delta = [{ a: 1 }, { a: 1 }]
      const currentClock = { b: 1 }
      expect(isDeltaInteresting(delta, currentClock)).to.be.false()
    })

    it('accepts concurrent that starts from inside and expands multiple', () => {
      const delta = [{ a: 1 }, { a: 2 }]
      const currentClock = { b: 1, a: 1 }
      expect(isDeltaInteresting(delta, currentClock)).to.be.true()
    })

    it('does not accept concurrent that starts from inside and ends in self', () => {
      const delta = [{ b: 1 }, { b: 1 }]
      const currentClock = { b: 2 }
      expect(isDeltaInteresting(delta, currentClock)).to.be.false()
    })
  })

  describe('isIdentical', () => {
    it('empty clocks', () => {
      expect(isIdentical({}, {})).to.be.true()
    })

    it('clocks with single equal k/v', () => {
      expect(isIdentical({ a: 1 }, { a: 1 })).to.be.true()
    })

    it('clocks with multiple equal k/v', () => {
      expect(isIdentical({ a: 1, b: 2, c: 3 }, { a: 1, b: 2, c: 3 })).to.be.true()
    })

    it('empty vs single k/v', () => {
      expect(isIdentical({ a: 1 }, {})).to.be.false()
    })

    it('single k/v vs empty', () => {
      expect(isIdentical({ a: 1 }, {})).to.be.false()
    })

    it('same key but different value', () => {
      expect(isIdentical({ a: 1 }, { a: 2 })).to.be.false()
    })

    it('first subset of second', () => {
      expect(isIdentical({ a: 1 }, { a: 1, b: 2 })).to.be.false()
    })

    it('second subset of first', () => {
      expect(isIdentical({ a: 1, b: 2 }, { b: 2 })).to.be.false()
    })
  })

  const tests = [
    ['two empties', [{}, {}]],
    ['one empty one full', [{ a: 1 }, {}]],
    ['one full one empty', [{}, { a: 1 }]],
    ['two distinct', [{ a: 1, b: 2 }, { c: 1, d: 2 }]],
    ['two intersecting', [{ a: 1, b: 2 }, { b: 1, c: 2 }]]
  ]

  const expected = {
    diff: [
      {},
      {},
      { a: 1 },
      { c: 1, d: 2 },
      { b: 1, c: 2 }
    ],
    merge: [
      {},
      { a: 1 },
      { a: 1 },
      { a: 1, b: 2, c: 1, d: 2 },
      { a: 1, b: 2, c: 2 }
    ],
    minimum: [
      {},
      { a: 0 },
      { a: 0 },
      { a: 0, b: 0, c: 0, d: 0 },
      { a: 0, b: 1, c: 0 }
    ],
    subtract: [
      {},
      { a: -1 },
      { a: 1 },
      { a: -1, b: -2, c: 1, d: 2 },
      { a: -1, b: -1, c: 2 }
    ],
    sumAll: [
      {},
      { a: 1 },
      { a: 1 },
      { a: 1, b: 2, c: 1, d: 2 },
      { a: 1, b: 3, c: 2 }
    ]
  }

  for (const [fn, exp] of Object.entries(expected)) {
    describe(fn, () => {
      for (const [i, [name, params]] of tests.entries()) {
        it(name, () => {
          expect(vectorclock[fn](params[0], params[1])).to.eql(exp[i])
        })
      }
    })
  }
})

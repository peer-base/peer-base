/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const DialCache = require('../../src/discovery/dial-cache')
const FakePeerInfo = require('../utils/fake-peer-info')

describe('dial cache', () => {
  it('returns correct value on add', (done) => {
    const cache = new DialCache({
      dialCacheExpiryMS: 50,
      dialCacheCapacity: 3
    })

    // First time it should be fresh
    expect(cache.add(new FakePeerInfo('a'))).to.equal(true)

    // Second time it should not be fresh
    expect(cache.add(new FakePeerInfo('a'))).to.equal(false)

    setTimeout(() => {
      // After the expiry time it should be fresh again
      expect(cache.add(new FakePeerInfo('a'))).to.equal(true)
      done()
    }, 100)
  })

  it('does not exceed capacity', () => {
    const cache = new DialCache({
      dialCacheCapacity: 3
    })

    cache.add(new FakePeerInfo('a'))
    cache.add(new FakePeerInfo('b'))
    cache.add(new FakePeerInfo('c'))

    // Should evict oldest peer
    cache.add(new FakePeerInfo('d'))
    expect(cache.add(new FakePeerInfo('a'))).to.equal(true)
    expect(cache.size).to.equal(3)

    // Should evict oldest peer
    expect(cache.add(new FakePeerInfo('b'))).to.equal(true)
    expect(cache.size).to.equal(3)
  })

  it('add is fresh after remove', () => {
    const cache = new DialCache({
      dialCacheCapacity: 3
    })

    // First time it should be fresh
    expect(cache.add(new FakePeerInfo('a'))).to.equal(true)

    // Second time it should not be fresh
    expect(cache.add(new FakePeerInfo('a'))).to.equal(false)

    // After remove it should be fresh
    cache.remove(new FakePeerInfo('a'))
    expect(cache.add(new FakePeerInfo('a'))).to.equal(true)
  })
})

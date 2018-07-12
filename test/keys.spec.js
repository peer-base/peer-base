/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Keys = require('../').keys

describe('keys', () => {
  let keys
  let encoded

  it('can be generated', async () => {
    keys = await Keys.generate()
  })

  it('can be uri-encoded', () => {
    encoded = Keys.uriEncode(keys)
    expect(typeof encoded).to.equal('string')
  })

  it('can be uri-decoded', async () => {
    const decoded = await Keys.uriDecode(encoded)
    expect(decoded.read.equals(keys.read)).to.be.true()
    expect(decoded.write.equals(keys.write)).to.be.true()
  })
})

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

  it('can generate a new symmetrical key', (done) => {
    Keys.generateSymmetrical().then((key) => {
      key.key.encrypt(Buffer.from('message'), (err, encrypted) => {
        expect(err).to.not.exist()
        key.key.decrypt(encrypted, (err, decrypted) => {
          expect(err).to.not.exist()
          expect(decrypted.toString()).to.equal('message')
          done()
        })
      })
    })

  })
})

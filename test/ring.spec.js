/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Ring = require('../src/transport/ring')

describe('ring', () => {
  let r

  it('can be created', () => {
    r = Ring()
  })

  it('can add a node', () => {
    r.add([1])
  })

  it('can get successor', () => {
    const succ = r.successorOf([1])
    console.log('succ:', succ)
    expect(succ).to.deep.equal([1])
  })

  it('can add a few more nodes', () => {
    r.add([1, 2])
    r.add([1, 3])
    r.add([1, 3]) // duplicate, on purpose
    r.add([1, 10])
  })

  it('can get the successor', () => {
    const succ = r.successorOf([1])
    expect(succ).to.deep.equal([1, 2])
  })

  it('can get the successor\'s successor', () => {
    const succ = r.successorOf(r.successorOf([1]))
    expect(succ).to.deep.equal([1, 3])
  })

  it('can get the successor of the last', () => {
    const succ = r.successorOf([1, 10])
    expect(succ).to.deep.equal([1])
  })

  it('can get the exact point at', () => {
    expect(r.at([1, 2])).to.deep.equal([1, 2])
  })

  it('can get the point at', () => {
    expect(r.at([1, 5])).to.deep.equal([1, 3])
  })

  it('can get the point at past end', () => {
    expect(r.at([1, 11])).to.deep.equal([1, 10])
  })

  it('can remove a point', () => {
    r.remove([1])
    expect(r.successorOf([1, 10])).to.deep.equal([1, 2])
  })
})

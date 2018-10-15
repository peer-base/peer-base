/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Ring = require('../src/common/ring')
const DiasSet = require('../src/common/dias-peer-set')

describe('dias set', () => {
  let id = [0, 0]
  let r
  let diasSet

  it('can be created', () => {
    r = Ring()
    diasSet = DiasSet(2, new FakePeerInfo(id), 0)
  })

  it('is empty at start', () => {
    expect(diasSet(r).size).to.equal(0)
  })

  it('can add a node', () => {
    r.add(new FakePeerInfo([0, 1]))
    expect(Array.from(diasSet(r).values()).map(peerInfoToId)).to.deep.equal([[0, 1]])
  })

  it('can add some nodes before 1/5th', () => {
    r.add(new FakePeerInfo([0, 2]))
    r.add(new FakePeerInfo([0, 3]))
    r.add(new FakePeerInfo([0, 4]))
    r.add(new FakePeerInfo([0, 5]))
    r.add(new FakePeerInfo([0, 6]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [0, 6]
      ])
  })

  it('can add a node before 1/5th', () => {
    r.add(new FakePeerInfo([51, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [0, 5],
        [51, 0]
      ])
  })

  it('can add a node before 1/4th', () => {
    r.add(new FakePeerInfo([63, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [51, 0],
        [63, 0]
      ])
  })

  it('can add a node before 1/3rd', () => {
    r.add(new FakePeerInfo([85, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([
        [0, 1],
        [0, 2],
        [0, 3],
        [51, 0],
        [63, 0],
        [85, 0]
      ])
  })

  it('can add a node after 1/2', () => {
    r.add(new FakePeerInfo([128, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([
        [0, 1],
        [0, 2],
        [51, 0],
        [63, 0],
        [85, 0],
        [128, 0]
      ])
  })

  it('can work with poorly distributed small sets', () => {
    id = [0x21, 0x97]
    r = Ring()
    diasSet = DiasSet(2, new FakePeerInfo(id), 0)
    r.add(new FakePeerInfo([0x4e, 0x31]))
    r.add(new FakePeerInfo([0xef, 0x5b]))
    r.add(new FakePeerInfo([0x8b, 0xb5]))
    r.add(new FakePeerInfo([0xf3, 0x00]))
    r.add(new FakePeerInfo([0xf8, 0xee]))
    r.add(new FakePeerInfo([0xef, 0x07]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([
        [0x4e, 0x31],
        [0x8b, 0xb5],
        [0xef, 0x07],
        [0xef, 0x5b],
        [0xf3, 0x00],
        [0xf8, 0xee]
      ])
  })
})

function sort (a, b) {
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const l = a[i] || 0
    const r = b[i] || 0
    if (l !== r) {
      return l - r
    }
  }

  return 0
}

class FakePeerInfo {
  constructor (id) {
    this.id = {
      toBytes () {
        return id
      }
    }
  }
}

function peerInfoToId (pi) {
  return pi.id.toBytes()
}

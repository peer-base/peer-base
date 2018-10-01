/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Ring = require('../src/common/ring')
const DiasSet = require('../src/common/dias-peer-set')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')

describe('dias set', () => {
  const id = [0, 0]
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
      .to.deep.equal([[0, 1], [0, 2], [0, 6]])
  })

  it('can add a node before 1/5th', () => {
    r.add(new FakePeerInfo([51, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([[0, 1], [0, 2], [51, 0]])
  })

  it('can add a node before 1/4th', () => {
    r.add(new FakePeerInfo([63, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([[0, 1], [0, 2], [51, 0], [63, 0]])
  })

  it('can add a node before 1/3rd', () => {
    r.add(new FakePeerInfo([85, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([[0, 1], [0, 2], [51, 0], [63, 0], [85, 0]])
  })

  it('can add a node after 1/2', () => {
    r.add(new FakePeerInfo([128, 0]))
    expect(
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort))
      .to.deep.equal([[0, 1], [0, 2], [51, 0], [63, 0], [85, 0], [128, 0]])
  })

  it('can work with poorly distributed small sets', () => {
    r = Ring(2)
    const peerInfo = new PeerInfo(PeerId.createFromB58String('QmQbmmST1FUR3yV6duqVanpipu7CvR5cQJkVbWAesQHZoA'))
    diasSet = DiasSet(32, peerInfo, 2)
    r.add(new PeerInfo(PeerId.createFromB58String('QmTbtfVDtQcQRsw8qTCxaKC2e9A73vhTkY96Vd78jhEUpE')))
    r.add(new PeerInfo(PeerId.createFromB58String('QmeT1DABf1S1h3fUS9AT8FXZDYibAwoCg2yMgF2LQTdNYT')))
    r.add(new PeerInfo(PeerId.createFromB58String('QmXk1e4WjpU8zkELePbfM7y2piH7hMZhpyrFkPzWBuhsdN')))
    r.add(new PeerInfo(PeerId.createFromB58String('QmehDvwCWhcHSvFWKit59Liuxxu28N17Rm5pdpPN6uFC5H')))
    r.add(new PeerInfo(PeerId.createFromB58String('QmY2VneWoQW9KgjhfC6FQJxMtpL6NwLKmnreahgmSvJjM2')))
    r.add(new PeerInfo(PeerId.createFromB58String('QmeRizpk55kPQJ1T5kfqLHBzRFoocD3BDDbQMakRdNskst')))
    console.log('Jim ring')
    r._points.forEach(point => {
      console.log(
        '  ', point.toString('hex'),
        r._contacts.get(point.toString('hex')).id.toB58String()
      )
    })
    console.log('Jim ring from', peerInfo.id.toB58String())
    let cursor = r.successorOf(peerInfo)
    console.log('Jim ring0', cursor.id.toB58String())
    cursor = r.successorOf(cursor)
    console.log('Jim ring1', cursor.id.toB58String())
    cursor = r.successorOf(cursor)
    console.log('Jim ring2', cursor.id.toB58String())
    cursor = r.successorOf(cursor)
    console.log('Jim ring3', cursor.id.toB58String())
    cursor = r.successorOf(cursor)
    console.log('Jim ring4', cursor.id.toB58String())
    cursor = r.successorOf(cursor)
    console.log('Jim ring5', cursor.id.toB58String())
    cursor = r.successorOf(cursor)
    console.log('Jim ring6', cursor.id.toB58String())
    console.log('Jim',
      [...r._contacts.keys()].map(key => [key, r._contacts.get(key).id.toB58String().slice(-3)]),
      Array.from(diasSet(r).values()).map(peerInfoToId).sort(sort)
    )
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

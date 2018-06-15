'use strict'

const EventEmitter = require('events')
const multihashing = require('multihashing')
const MembershipGossipFrequencyHeuristic = require('./membership-gossip-frequency-henristic')

module.exports = class Membership extends EventEmitter {
  constructor (ipfs, app, collaborationName) {
    super()

    this._ipfs = ipfs
    this._app = app
    this._collaborationName = collaborationName

    this._members = new Set()
    this._gossipNow = this._gossipNow.bind(this)

    this._membershipGossipFrequencyHeuristic = new MembershipGossipFrequencyHeuristic(app, this)
    this._someoneHasMembershipWrong = true
  }

  start () {
    this._membershipGossipFrequencyHeuristic.on('gossip now', this._gossipNow)
    this._membershipGossipFrequencyHeuristic.start()
  }

  stop () {
    this._membershipGossipFrequencyHeuristic.stop()
    this._membershipGossipFrequencyHeuristic.removeListener('gossip now', this._gossipNow)
  }

  peerCount () {
    return this._members.size
  }

  peers () {
    return new Set(this._members)
  }

  needsUrgentBroadcast () {
    // needs to broadcast if self id is not included in the member set yet
    if (this._someoneHasMembershipWrong) {
      return true
    }
    return this._ipfs.id()
      .then((peer) => peer.id)
      .then((id) => {
        const isUrgent = !this._members.has(id)
        return isUrgent
      })
  }

  deliverRemoteMembership (membership) {
    if ((typeof membership) === 'string') {
      const expectedMembershipHash = this._createMembershipSummaryHash()
      this._someoneHasMembershipWrong = membership !== expectedMembershipHash
    } else if (Array.isArray(membership)) {
      this._joinMembership(membership)
    }
  }

  async _gossipNow () {
    return this._ipfs.id()
      .then((peer) => peer.id)
      .then(async (id) => {
        let message
        if (await this.needsUrgentBroadcast()) {
          message = this._createMembershipMessage(id)
        } else {
          message = this._createMembershipSummaryMessage(id)
        }
        this._someoneHasMembershipWrong = false
        console.log('gossiping', message.toString())
        this._app.gossip(message)
      })
  }

  _createMembershipSummaryMessage (selfId) {
    const message = [
      this._membershipTopic(),
      this._createMembershipSummaryHash()]
    return Buffer.from(JSON.stringify(message))
  }

  _createMembershipSummaryHash () {
    const membership = Buffer.from(JSON.stringify(Array.from(this._members).sort()))
    return multihashing.digest(
      membership,
      'sha1').toString('base64')
  }

  _createMembershipMessage (selfId) {
    this._members.add(selfId)
    const message = [this._membershipTopic(), Array.from(this._members)]
    // TODO: sign and encrypt membership message
    return Buffer.from(JSON.stringify(message))
  }

  _joinMembership (remoteMembershipArray) {
    let hasChanges = false
    remoteMembershipArray.forEach((member) => {
      if (!this._members.has(member)) {
        hasChanges = true
        this._members.add(member)
      }
    })

    if (hasChanges) {
      this.emit('changed')
    }
  }

  _membershipTopic () {
    return this._collaborationName
  }
}

'use strict'

const debug = require('debug')('peer-star:discovery:peer-interest')
const EventEmitter = require('events')

// Listen to floodsub to find out if a peer is interested in our app topic
module.exports = class PeerInterestDiscovery extends EventEmitter {
  constructor (ipfs, appTopic) {
    super()

    this._ipfs = ipfs
    this._appTopic = appTopic
    this._onSubscriptionChange = this._onSubscriptionChange.bind(this)
  }

  start () {
    debug('start')
    this._ipfs._libp2pNode._floodSub.on('floodsub:subscription-change', this._onSubscriptionChange)
  }

  stop () {
    debug('stop')
    this._ipfs._libp2pNode._floodSub.removeListener('floodsub:subscription-change', this._onSubscriptionChange)
  }

  _onSubscriptionChange (peerInfo, topics, subs) {
    debug('floodsub change:', peerInfo, topics, subs)
    const isInterested = topics.has(this._appTopic)
    this.emit('peer', peerInfo, isInterested)
  }
}

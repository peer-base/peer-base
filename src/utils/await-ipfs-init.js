'use strict'

const POLL_INTERVAL = 1000

module.exports = function awaitIpfsInit (ipfs) {
  return new Promise((resolve, reject) => {
    // Instead of waiting for IPFS to be ready, we only need
    // the peer id to start working.
    // Would be nicer if IPFS gave us an event when
    // the peerId is set: https://github.com/ipfs/js-ipfs/issues/1058

    (function checkPeerInfo () {
      if (ipfs.isOnline() && ipfs._peerInfo && ipfs._peerInfo.id) {
        resolve(ipfs._peerInfo.id)
      } else {
        setTimeout(checkPeerInfo, POLL_INTERVAL)
      }
    })()
  })
}

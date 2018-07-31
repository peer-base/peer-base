'use strict'

const IpfsAPI = require('ipfs-api')

module.exports = startLanDiscovery

const IPFS_RELAY_ADDR = '/dns4/relay.decentralizedweb.net/tcp/4004/wss/ipfs/QmPdHHgEr1gKbMuhiBf6545BL7mxaKbmCKbaJE7yY4CkBg'
//'/ip4/10.7.0.55/tcp/4004/ws/ipfs/QmQJPPKEd1a1zLrsDzmzKMnbkkNNmCziUMsXvvkLbjPg1c'

function startLanDiscovery (ipfs, appTransport, options) {
  if ((typeof options.relayWSAddr) !== 'string') {
    throw new Error('need options.ipfs.relay.relayWSAddr (multiaddr string)')
  }
  if ((typeof options.apiAddr) !== 'string') {
    throw new Error('need options.ipfs.relay.apiAddr (multiaddr string)')
  }

  const onceIPFSStarted = () => {
    ipfs.id().then((peerInfo) => {
      const myId = peerInfo.id

      const remoteIPFS = IpfsAPI(options.apiAddr)
        //'/dns4//tcp/5001', { protocol: 'http' })


      scheduleLanPoll()

      function scheduleLanPoll () {
        setTimeout(() => {
          doLanPoll()
            .then(() => {
              scheduleLanPoll()
            }).catch((err) => {
              console.error(err.message)
              scheduleLanPoll()
            })
        }, 5000)
      }

      function doLanPoll () {
        return new Promise((resolve, reject) => {
          ipfs.swarm.connect(options.relayWSAddr, (err) => {
            if (err) {
              return reject(err)
            }

            remoteIPFS.swarm.addrs().then((peerInfos) => {
              peerInfos.forEach((peerInfo) => {
                const peerId = peerInfo.id.toB58String()
                if (peerId === myId) {
                  return
                }
                peerInfo.multiaddrs.forEach((ma) => {
                  const maStr = ma.toString()
                  if (maStr.indexOf('/p2p-circuit/') === 0) {
                    if (!appTransport.hasPeer(peerInfo)) {
                      appTransport.discovery._peerDiscovered(peerInfo)
                    }
                  }
                })
              })
              resolve()
            }).catch(reject)
          })
        })
      }
    })
  }

  if (ipfs.isOnline()) {
    onceIPFSStarted()
  } else {
    ipfs.once('ready', onceIPFSStarted)
  }
}

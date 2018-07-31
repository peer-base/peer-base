'use strict'

const IpfsAPI = require('ipfs-api')

module.exports = startLanDiscovery

function startLanDiscovery (ipfs, appTransport) {
  ipfs.once('ready', () => {
    ipfs.id().then((peerInfo) => {
      const myId = peerInfo.id

      const remoteIPFS = IpfsAPI('localhost', 5001)

      scheduleLanPoll()

      function scheduleLanPoll () {
        setTimeout(() => {
          doLanPoll()
            .then(() => {
              scheduleLanPoll()
            }).catch((err) => {
              console.error(err)
              scheduleLanPoll()
            })
        }, 5000)
      }

      function doLanPoll () {
        return new Promise((resolve, reject) => {
          ipfs.swarm.connect('/ip4/127.0.0.1/tcp/4004/ws/ipfs/QmQJPPKEd1a1zLrsDzmzKMnbkkNNmCziUMsXvvkLbjPg1c', (err) => {
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
  })
}

/* eslint no-console: "off" */
'use strict'

const IpfsAPI = require('ipfs-api')

module.exports = startLanDiscovery

function startLanDiscovery (ipfs, appTransport, options) {
  if ((typeof options.relayWSAddr) !== 'string') {
    throw new Error('need options.ipfs.relay.relayWSAddr (multiaddr string)')
  }
  if (!options.apiAddr) {
    throw new Error('need options.ipfs.relay.apiAddr')
  }

  const onceIPFSStarted = () => {
    ipfs.id().then((peerInfo) => {
      const myId = peerInfo.id

      const remoteIPFS = IpfsAPI(options.apiAddr)

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
                for (let ma of peerInfo.multiaddrs) {
                  const maStr = ma.toString()
                  if ((maStr.indexOf('/p2p-circuit/') === 0)) {
                    appTransport.discovery._dialPeer(peerInfo)
                  }
                }
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

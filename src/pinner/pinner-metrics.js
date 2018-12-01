'use strict'

module.exports = (pinner) => {
  const client = require('prom-client')
  const register = client.register

  client.collectDefaultMetrics()
  const metrics = {
    totalConnectedPeers: new client.Gauge({ name: 'peerstar_peers', help: 'total peers connected' }),
    totalCollaborations: new client.Gauge({ name: 'peerstar_collaborations', help: 'total number of active collaborations' })
  }

  pinner.on('collaboration started', () => {
    metrics.totalCollaborations.inc(1)
  })

  pinner.on('collaboration stopped', () => {
    metrics.totalCollaborations.dec(1)
  })

  const connMan = pinner.getGlobalConnectionManager()
  connMan.on('connected', () => {
    metrics.totalConnectedPeers.inc(1)
  })
  connMan.on('disconnected', () => {
    metrics.totalConnectedPeers.dec(1)
  })
  // const dialsSuccessTotal = new client.Counter({ name: 'rendezvous_dials_total_success', help: 'sucessfully completed dials since server started' })
  // const dialsFailureTotal = new client.Counter({ name: 'rendezvous_dials_total_failure', help: 'failed dials since server started' })
  // const dialsTotal = new client.Counter({ name: 'rendezvous_dials_total', help: 'all dials since server started' })
  // const joinsSuccessTotal = new client.Counter({ name: 'rendezvous_joins_total_success', help: 'sucessfully completed joins since server started' })
  // const joinsFailureTotal = new client.Counter({ name: 'rendezvous_joins_total_failure', help: 'failed joins since server started' })
  // const joinsTotal = new client.Counter({ name: 'rendezvous_joins_total', help: 'all joins since server started' })
  return register
}

'use strict'

module.exports = (collaborationsOrIds) => {
  const peerIds = collaborationsOrIds.map(getPeerId)
  const collaborations = collaborationsOrIds.filter(isCollaboration)
  return Promise.all(collaborations.map((collaboration) => waitForPeersFromCollaborations(collaboration, peerIds)))
}

module.exports.fromMemberships = (memberships) => {
  const peerIds = memberships.map(getPeerId)
  return Promise.all(memberships.map((membership) => waitForPeersFromMemberships(membership, peerIds)))
}

function waitForPeersFromCollaborations (collaboration, peerIds) {
  return new Promise((resolve, reject) => {
    const members = collaboration.peers()
    if (setContains(peerIds, members)) {
      resolve()
    } else {
      collaboration.on('membership changed', (members) => {
        if (setContains(peerIds, members)) {
          resolve()
        }
      })
    }
  })
}

function waitForPeersFromMemberships (membership, peerIds) {
  return new Promise((resolve, reject) => {
    const members = membership.peers()
    if (setContains(peerIds, members)) {
      resolve()
    } else {
      membership.on('changed', () => {
        const members = membership.peers()
        if (setContains(peerIds, members)) {
          resolve()
        }
      })
    }
  })
}

function getPeerId (collaborationOrId) {
  if (typeof collaborationOrId === 'string') {
    return collaborationOrId
  }
  return collaborationOrId._ipfs._peerInfo.id.toB58String()
}

function isCollaboration (collaborationOrId) {
  return (typeof collaborationOrId) !== 'string'
}

function setContains (s1, s2) {
  s1 = new Set(s1)
  s2 = new Set(s2)
  for (var a of s1) if (!s2.has(a)) return false
  return true
}

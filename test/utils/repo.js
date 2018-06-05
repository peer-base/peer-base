'use strict'

const IPFSRepo = require('ipfs-repo')
const clean = require('./clean')
const os = require('os')
const path = require('path')
const hat = require('hat')

function createTempRepo (repoPath) {
  repoPath = repoPath || path.join(os.tmpdir(), '/ipfs-test-' + hat())

  const repo = new IPFSRepo(repoPath)

  repo.teardown = () => {
    return new Promise((resolve, reject) => {
      repo.close(() => {
        clean(repoPath)
        resolve()
      })
    })
  }

  return repo
}

module.exports = createTempRepo

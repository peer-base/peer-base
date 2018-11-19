'use strict'

const strategies = {
  'ipfs-repo': require('./ipfs-repo-store')
}

module.exports = (ipfs, collaboration, options = {}) => {
  let Strategy = options.storeStrategy
  if (!Strategy) {
    const strategyName = options.storeStrategyName || 'ipfs-repo'
    Strategy = strategies[strategyName]
    if (!Strategy) {
      throw new Error(`Unknown strategy "${strategyName}"`)
    }
  }

  return Strategy(ipfs, collaboration, options)
}

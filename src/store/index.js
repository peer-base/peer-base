'use strict'

const strategies = {
  'ipfs-repo': require('./ipfs-repo-store'),
  memory: require('./memory-store'),
  'hybrid-ipfs-repo': require('./hybrid-ipfs-repo-store')
}

const DEFAULT_STRATEGY_NAME = 'hybrid-ipfs-repo'

module.exports = (ipfs, collaboration, options = {}) => {
  let Strategy = options.storeStrategy
  if (!Strategy) {
    const strategyName = options.storeStrategyName || DEFAULT_STRATEGY_NAME
    Strategy = strategies[strategyName]
    if (!Strategy) {
      throw new Error(`Unknown strategy "${strategyName}"`)
    }
  }

  return Strategy(ipfs, collaboration, options || {})
}

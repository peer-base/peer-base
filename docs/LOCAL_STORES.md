# Peer-star-app local store strategies

Peer-star implements different strategies for the store of any given collaboration. Here is a quick peak at the ones that are provided:

## memory

If you specify `memory` in the  `options.storeStrategyName` option of your collaboration, no data will be persisted once you stop the collaboration.


## ipfs-repo

If you specify `ipfs-repo` in the `options.storeStrategyName`, you will be using the IPFS repo to persist your collaboration data.

## hybrid-ipfs-repo

This strategy, (which is the default one), uses an in-memory data store for the operational data, and then flushes to the IPFS repo after debouncing the changes (or the user calls `collaboration.save()`).

## Example:

```js
const collaboration = await app.collaborate(name, type, {
  storeStrategyName: 'memory'
})
```

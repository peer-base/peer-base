# peer-star-app

Peer-Star App support

## Install

```bash
$ npm install peer-star-app
```

## Import

```js
const PeerStar = require('peer-star-app')
```

## API

### Create app

```js
const app = PeerStar('app name', options)
```

Options (are not required):

* `debounceResetConnectionsMS`: (defaults to `1000`): debounce membership changes before resetting connections.
* `ipfs`: object with:
  * `repo`: IPFS repo path or repo object
  * `swarm`: ipfs swarm addresses (array of string)
* samplingIntervalMS: (defaults to `1000`): membership gossip frequency heuristic sampling interval
* targetGlobalMembershipGossipFrequencyMS: (defaults to `1000`): target global membership gossip frequency, in ms.
* urgencyFrequencyMultiplier: (defaults to `10`): urgency multiplier when someone is wrong about membership

### Start app

```js
await app.start()
```

### Create collaboration

```js
const collaboration = await app.collaborate(collaborationName, type)

// stop collaboration
await collaboration.stop()
```

Arguments:
* collaborationName: string: should uniquely identify this collaboration in the whole world
* type: a string, identifying which type of CRDT should be used. Use [this reference table in the delta-crdts package](https://github.com/ipfs-shipyard/js-delta-crdts#types).

#### Create your own collaboration type

You can create your own collaboration type by registering it:

```js
// useless type here:
const Zero = (id) => ({
  initial: () => 0,
  join: (s1, s2) => 0,
  value: (state) => state
})

PeerStar.collaborationTypes.define('zero', Zero)
```

### Peer count estimate

Returns estimate of peers in app.

```js
app.peerCountEstimate()
```

### Collaboration

#### `collaboration.peers()`

Returns the peers of the collaboration, a Set of peer ids (string).

```js
Array.from(collaboration.peers()).forEach((peer) => {
  console.log('member peer: %s', peer)
})
```

#### `collaboration.outboundConnectionCount()`

Returns the number of peers this peer is pushing data to.

#### `collaboration.inboundConnectionCount()`

Returns the number of peers this peer is pulling data from.

#### Events:

##### `"membership changed" (peers: Set<peer id>)`

```js
collaboration.on('membership changed', (peers) => {
  Array.from(peers).forEach((peer) => {
    console.log('member peer: %s', peer)
  })
})
```

##### `"state changed"`

```js
collaboration.on('state changed', () => {
  console.log('state changed. New collaboration value is: %j', collaboration.shared.value())
})
```

#### `collaboration.shared`

The shared data in this collaboration.

##### `shared.value()`

Returns the CRDT view value.

##### shared mutators

Each shared document has document-specific mutators. See [the delta-crdts documentation](https://github.com/ipfs-shipyard/js-delta-crdts#types) for these.

### Stop app

```js
await app.stop()
```

### Guess peer count

```js
app.peerCountGuess() // returns integer Number >= 0
```

# Tests

Clone this repo and run:

```
$ npm install
$ npm test
```

# License

MIT

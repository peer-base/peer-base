# API

## Index

* [Install](#install)
* [Import](#import)
* [Create app](#create-app)
* [Start app](#start-app)
* [js-IPFS node](#js-ipfs-node)
* [Guess peer count](#guess-peer-count)
* [Keys](#keys)
* [Create collaboration](#create-collaboration)
* [App Events](#app-events)
* [Collaboration](#collaboration)
* [Local store strategies](#local-store-strategies)
* [IPFS Circuit Relay support](#ipfs-circui-relay-support)
* [Pinner](#pinner)

## Install

```bash
$ npm install peer-base
```

## Import

```js
const PeerBase = require('peer-base')
```

## Create app

```js
const app = PeerBase('app name', options)

app.on('error', (err) => {
  console.error('error in app:', err)
})
```

Options (are not required):

* `ipfs`: object with:
  * `repo`: IPFS repo path or repo object
  * `swarm`: ipfs swarm addresses (array of strings)
  * `bootstrap`: IPFS Bootstrap nodes (array of multiaddresses)
  * `relay`: an (optional) object containing the following attributes:
    * apiAddr: the multiaddress for the API server of the relay
    * relayWSAddr: the multiaddress for the relay websocket server address
* samplingIntervalMS: (defaults to `1000`): membership gossip frequency heuristic sampling interval
* targetGlobalMembershipGossipFrequencyMS: (defaults to `1000`): target global membership gossip frequency, in ms.
* urgencyFrequencyMultiplier: (defaults to `10`): urgency multiplier when someone is wrong about membership
* transport: optional object containing:
  * maxThrottleDelayMS: the maximum delay betweeen discovering a new peer and querying it to see whether they're interested in the app.

## Start app

```js
await app.start()
```

## js-IPFS node

A peer-star app comes with [a js-ipfs node](https://github.com/ipfs/js-ipfs#readme). You can access it through `app.ipfs`. Example:

```js
console.log(await app.ipfs.id())
```

## Guess peer count

```js
app.peerCountGuess() // returns integer Number >= 0
```

## Keys

Keys can be used to collaborate. If provided, they authenticate changes to the collaboration and encrypts them for transmission and storage. You can either create new keys or parse them from a string.

### `await Keys.generate()`

```js
const Keys = require('peer-base').keys

const keys = await Keys.generate()
```

### `Keys.uriEncode`

Encode keys into a URI-acceptable string:

```js
const Keys = require('peer-base').keys
const keys = await Keys.generate()

const string = Keys.uriEncode(keys)
```

### `Keys.uriEncodeReadOnly`

Encode the read-only key into a URI-acceptable string:

```js
const Keys = require('peer-base').keys
const keys = await Keys.generate()

const string = Keys.uriEncodeReadOnly(keys)
```

### `await Keys.uriDecode`

Decode keys from a string:

```js
const Keys = require('peer-base').keys
const keys = await Keys.generate()

const string = Keys.uriEncode(keys)

const decodedKeys = await Keys.uriDecode(string)
```

### Read-only keys

You can distribute a read-only key by using `PeerBase.keys.uriEncodeReadOnly(keys)`:

```js
const Keys = require('peer-base').keys
const keys = await Keys.generate()

const string = Keys.uriEncodeReadOnly(keys)
```

### Generate symmetrical key

```js
const Keys = require('peer-base').keys

// options are optional. defaults to:
const options = {
  keyLength: 32,
  ivLength: 16
}
const keys = await Keys.generateSymmetrical(options)

key.raw // contains raw key (buffer)
key.key // contains AES key
```

Returns (asynchronously) a key of type AES, as defined in [libp2p-crypto](https://github.com/libp2p/js-libp2p-crypto).

## Create collaboration

```js
const collaboration = await app.collaborate(collaborationName, type, options)

// stop collaboration
await collaboration.stop()
```

Arguments:
* `collaborationName`: string: should uniquely identify this collaboration in the whole world
* `type`: a string, identifying which type of CRDT should be used. Use [this reference table in the delta-crdts package](https://github.com/ipfs-shipyard/js-delta-crdts#types).
* `options`: object, not required. Can contain the keys:
  * `keys`: keys, generated or parsed from URL. See [keys section](#keys)
  * `maxDeltaRetention`: number: maximum number of retained deltas. Defaults to `1000`.
  * `deltaTrimTimeoutMS`: number: after a delta was added to the store, the time it waits before trying to trim the deltas.
  * `debounceResetConnectionsMS`: (defaults to `1000`): debounce membership changes before resetting connections.
  * `debouncePushMS`: (defaults to `200`): debounce time from collboration mutations into pushing them.
  * `debouncePushToPinnerMS`: (defaults to `5000`): debounce time from collboration mutations into pushing them into a pinner.
  * `receiveTimeoutMS`: (defaults to `3000`): time after which a connection is turned to eager mode to receive missing data.
  * `saveDebounceMS`: (defaults to `3000`): debouncing between changes and saving changes

### Create your own collaboration type

You can create your own collaboration type by registering it:

```js
// useless type here:
const Zero = (id) => ({
  initial: () => 0,
  join: (s1, s2) => 0,
  value: (state) => state
})

PeerBase.collaborationTypes.define('zero', Zero)
```

### Peer count estimate

Returns estimate of peers in app.

```js
app.peerCountEstimate()
```

### Sub-collaborations

You can create sub-collaborations to a given "root" collaboration, with it's separate CRDT type, but that is causally consistent with the root CRDT. Here's how:

```js
const subCollaboration = await collaboration.sub('name', 'type')
```

A sub-collaboration has the same API as a collaboration.


### Collaboration gossip

You can have collaboration-level private gossip like this:

```js
const gossip = await collaboration.gossip('gossip name')

gossip.on('message', (message, fromPeer) => {
  console.log('got message from peer ${fromPeer}: ${JSON.stringify(message)}')
})

const message = ['any', 'JSON', 'object']

gossip.broadcast(message)
```

### Collaboration stats

You can observe some collaboration traffic and topology statistics by doing:

```js
collaboration.stats.on('peer updated', (peerId, stats) => {
  console.log('peer %s updated its stats to:', peerId, stats)
})
```

The `stats` object looks something like this:

```js
{
  connections: {
    inbound: new Set(<peerId>),
    outbound: new Set(<peerId>)
  },
  traffic: {
    total: {
      in: <number>,
      out: <number>
    },
    perPeer: new Map(
      <peerId => {
        in: <number>,
        out: <number>
      }>)
  },
  messages: {
    total: {
      in: <number>,
      out: <number>
    },
    perPeer: new Map(
      <peerId => {
        in: <number>,
        out: <number>
      }>)
  }
}
```


## App Events

### `app.emit('error', err)`

### `app.emit('peer connected', (peerInfo) => {})`

When a peer connects.

### `app.emit('outbound peer connected', (peerInfo) => {})`

When a push connection is created.

### `app.emit('inbound peer connected', (peerInfo) => {})`

When a pull connection is created.

### `app.emit('peer disconnected', (peerInfo) => {})`

When a peer disconnects.

### `app.emit('outbound peer disconnected', (peerInfo) => {})`

When a push connection ends.

### `app.emit('inbound peer disconnected', (peerInfo) => {})`

When a pull connection ends.


## Collaboration

### `collaboration.peers()`

Returns the peers of the collaboration, a Set of peer ids (string).

```js
Array.from(collaboration.peers()).forEach((peer) => {
  console.log('member peer: %s', peer)
})
```

### `collaboration.outboundConnectionCount()`

Returns the number of peers this peer is pushing data to.

### `collaboration.inboundConnectionCount()`

Returns the number of peers this peer is pulling data from.

### `collaboration.name`

The name of the collaboration (String).

### `collaboration.app`

Convenience reference to the app object.

### Collaboration events:

#### `"membership changed" (peers: Set<peer id (String)>)`

```js
collaboration.on('membership changed', (peers) => {
  for (peer of peers) {
    console.log('member peer: %s', peer)
  }
})
```

#### `"state changed"`

Emitted every time the state changes. This is emitted immediately after a change is applied on the CRDT state.

```js
collaboration.on('state changed', () => {
  console.log('state changed. New collaboration value is: %j', collaboration.shared.value())
})
```

__NOTE__: When receiving remote updates, this event may fire many times per second. You may want to use a debounce or a throttle mechanism when handling this event. If you do that, beware that the state in your UI may be out of sync with the state of the CRDT.

#### `"saved"`

When the collaboration data is saved to a local persistent store.


#### `"stopped"`

When the collaboration is stopped locally.

```js
collaboration.once('stopped', () => {
  console.log('collaboration %s stopped', collaboration.name)
})
```


### Collaboration shared value: `collaboration.shared`

The shared data in this collaboration.

#### `shared.value()`

Returns the CRDT view value.

#### shared mutators

Each shared document has document-specific mutators. See [the delta-crdts documentation](https://github.com/ipfs-shipyard/js-delta-crdts#types) for these.

Example:

```js
collaboration.shared.push('some element')
```

### Collaboration replication: `collaboration.replication`

Provides queries and events about replication.

#### `collaboration.replication.pinnerPeers()`

Returns a Set containing the peer ids (string) of each pinner node participating in the collaboration.

#### `collaboration.replication.isCurrentStatePersistedOnPinner()`

Returns the number of peers the current state is known to be persisted to.

Example:

```js
const pinned = collaboration.replication.isCurrentStatePersistedOnPinner()`
if (!pinned) {
  console.log('not pinned on any pinner!')
}
```

or:

```js
const pinnedCount = collaboration.replication.isCurrentStatePersistedOnPinner()
console.log('pinned on %d pinners', pinnedCount)
```

#### Replication events:

#### `"replicating" (peerId, clock)`

Emitted once our local changes are __beginning to be replicated__ to a remote replica.

```js
collaboration.replication.on('replicating', (peerId, clock) => {
  console.log('local changes are being replicated to %s', peerId)
})
```

#### `"replicated" (peerId, clock)`

Emitted once our local changes are replicated to a remote replica.

```js
collaboration.replication.on('replicated', (peerId, clock) => {
  console.log('local changes replicated to %s', peerId)
})
```

#### `"receiving" (peerId, clock)`

Emitted once remote changes are being transmitted from a remote peer.

```js
collaboration.replication.on('receiving', (peerId, clock) => {
  console.log('remote changes are being received from %s', peerId)
})
```

#### `"received" (peerId, clock)`

Emitted once remote changes are saved locally.

```js
collaboration.replication.on('received', (peerId, clock) => {
  console.log('remote changes saved from %s', peerId)
})
```

#### `"pinning" (peerId, clock)`

Emitted once local changes are starting to be saved into a remote pinner.

```js
collaboration.replication.on('pinning', (peerId, clock) => {
  console.log('local changes started being saved to pinner %s', peerId)
})
```

#### `"pinned" (peerId, clock)`

Emitted once local changes are saved into a remote pinner.

```js
collaboration.replication.on('pinned', (peerId, clock) => {
  console.log('local changes saved to pinner %s', peerId)
})
```

#### `"pinner joined" (peerId)`

Emitted once a pinner has joined the collaboration.

```js
collaboration.replication.on('pinner joined', (peerId) => {
  console.log('pinner has joined %s', peerId)
  console.log('now the pinners in the collaboration are: %j', [...collaboration.replication.pinnerPeers()])
})
```

#### `"pinner left" (peerId)`

Emitted once a pinner has left the collaboration.

```js
collaboration.replication.on('pinner left', (peerId) => {
  console.log('pinner has left %s', peerId)
  console.log('now the pinners in the collaboration are: %j', [...collaboration.replication.pinnerPeers()])
})
```


### Stop collaboration

```js
await collaboration.stop()
```

## Stop app

```js
await app.stop()
```

## Local store strategies

If you want to know or change the way that peer-star persists the collaboration locally, you can read [LOCAL_STORES.md](LOCAL_STORES.md).

## IPFS Circuit Relay support

peer-base supports using a circuit relay peer. For that you need to set up a go-ipfs node with circuit relay enabled. On your peer-base options, you can then pass in `options.ipfs.relay` with an object with the following attributes:

* `relayWSAddr`: the multiaddress for the websocket server of the relay server
* `apiAddr`: the multiaddress for the relay server API address (which we need for polling the known peers)

# Pinner (API and CLI)

You can pin collaborations for peer-* apps without delegating keys. You can do this through the JS API or the command-line.

## API

You can spawn the pinner through the JS API:

```js
const pinner = PeerBase.createPinner('app name' [, options])
```

Options:

* `collaborationInnactivityTimeoutMS`: (defaults to `60000`). The amount of time to wait for activity before the pinner stops participating in the collaboration.
* `ipfs`: same as app `options.ipfs` (see above).

## Pinner events

A pinner emits the following events:

### `collaboration started` (collaboration)

Emitted when a collaboration starts.

### `collaboration stopped` (collaboration)

Emitted when a collaboration stops (probably because of innactivity).

## Command-line

To install a pinner you can:

```sh
$ npm install -g peer-base
$ PEER_STAR_APP_NAME=my-app-name pinner
```

Besides `PEER_STAR_APP_NAME`, the pinner also accepts the `PEER_STAR_SWARM_ADDRESS` environment variable containing the swarm address.

Another example:

```
PEER_STAR_SWARM_ADDRESS=/dns4/127.0.0.1/tcp/9090/ws/p2p-websocket-star PEER_STAR_APP_NAME=peer-pad/2 pinner
```

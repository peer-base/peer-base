# peer-star-app

Build real-time collaborative DApps on top of IPFS

[![Build Status](https://travis-ci.org/ipfs-shipyard/peer-star-app.svg?branch=master)](https://travis-ci.org/ipfs-shipyard/peer-star-app) [![Greenkeeper badge](https://badges.greenkeeper.io/ipfs-shipyard/peer-star-app.svg)](https://greenkeeper.io/) [![made by Protocol Labs](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](https://protocol.ai)


* [Example app](examples/react-app)
* [How to run the example app](#run-example-app)

# Documentation

* [Code structure](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/CODE-STRUCTURE.md)
* [Protocol](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/PROTOCOL.md)
* [Performance tests](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/PERFORMANCE-TESTS.md)

## Install

```bash
$ npm install peer-star-app
```

## Import

```js
const PeerStar = require('peer-star-app')
```

# API

## Create app

```js
const app = PeerStar('app name', options)

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

### Guess peer count

```js
app.peerCountGuess() // returns integer Number >= 0
```

## Keys

Keys can be used to collaborate. If provided, they authenticate changes to the collaboration and encrypts them for transmission and storage. You can either create new keys or parse them from a string.

### `await Keys.generate()`

```js
const Keys = require('peer-star-app').keys

const keys = await Keys.generate()
```

### `Keys.uriEncode`

Encode keys into a URI-acceptable string:

```js
const Keys = require('peer-star-app').keys
const keys = await Keys.generate()

const string = Keys.uriEncode(keys)
```

### `Keys.uriEncodeReadOnly`

Encode the read-only key into a URI-acceptable string:

```js
const Keys = require('peer-star-app').keys
const keys = await Keys.generate()

const string = Keys.uriEncodeReadOnly(keys)
```

### `await Keys.uriDecode`

Decode keys from a string:

```js
const Keys = require('peer-star-app').keys
const keys = await Keys.generate()

const string = Keys.uriEncode(keys)

const decodedKeys = await Keys.uriDecode(string)
```

### Read-only keys

You can distribute a read-only key by using `PeerStar.keys.uriEncodeReadOnly(keys)`:

```js
const Keys = require('peer-star-app').keys
const keys = await Keys.generate()

const string = Keys.uriEncodeReadOnly(keys)
```

### Generate symmetrical key

```js
const Keys = require('peer-star-app').keys

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

### Create your own collaboration type

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

## Sub-collaborations

You can create sub-collaborations to a given "root" collaboration, with it's separate CRDT type, but that is causally consistent with the root CRDT. Here's how:

```js
const subCollaboration = await collaboration.sub('name', 'type')
```

A sub-collaboration has the same API as a collaboration.


## Collaboration gossip

You can have collaboration-level private gossip like this:

```js
const gossip = await collaboration.gossip('gossip name')

gossip.on('message', (message, fromPeer) => {
  console.log('got message from peer ${fromPeer}: ${JSON.stringify(message)}')
})

const message = ['any', 'JSON', 'object']

gossip.broadcast(message)
```

## Collaboration stats

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

### Events:

#### `"membership changed" (peers: Set<peer id (String)>)`

```js
collaboration.on('membership changed', (peers) => {
  for (peer of peers) {
    console.log('member peer: %s', peer)
  }
})
```

#### `"state changed"`

Emitted every time the state changes. Has one argument, a boolean, saying `true` if and only if the change came from this peer. This is emitted immediately after a change is applied on the CRDT state.

```js
collaboration.on('state changed', (fromSelf) => {
  console.log('state changed. New collaboration value is: %j', collaboration.shared.value())
})
```

__NOTE__: When receiving remote updates, this event may fire many times per second. You may want to use a debounce or a throttle mechanism when handling this event. If you do that, beware that the state in your UI may be out of sync with the state of the CRDT.

#### `"stopped"`

When the collaboration is stopped locally.

```js
collaboration.once('stopped', () => {
  console.log('collaboration %s stopped', collaboration.name)
})
```


### `collaboration.shared`

The shared data in this collaboration.

#### `shared.value()`

Returns the CRDT view value.

#### shared mutators

Each shared document has document-specific mutators. See [the delta-crdts documentation](https://github.com/ipfs-shipyard/js-delta-crdts#types) for these.

Example:

```js
collaboration.shared.push('some element')
```

### Stop collaboration

```js
await collaboration.stop()
```

## Stop app

```js
await app.stop()
```

## IPFS Circuit Relay support

Peer-star-app supports using a circuit relay peer. For that you need to set up a go-ipfs node with circuit relay enabled. On your peer-star-app options, you can then pass in `options.ipfs.relay` with an object with the following attributes:

* `relayWSAddr`: the multiaddress for the websocket server of the relay server
* `apiAddr`: the multiaddress for the relay server API address (which we need for polling the known peers)

# Pinner

You can pin collaborations for peer-* apps without delegating keys. To install a pinner you can:

```sh
$ npm install -g peer-star-app
$ pinner "app name" ["swarm address"]
```


# Run example app

Clone this repo.

```bash
$ cd peer-star-app
$ cd examples/react-app
$ npm install
```

In a different window, on the same dir, start the rendezvous server:

```bash
$ npm run start:rv
```

In a different window, on the same dir, run the app server:

```bash
$ npm start
```

Open [http://localhost:3000](http://localhost:3000) and test the app.

# Tests

Clone this repo and run:

```
$ npm install
$ npm test
```

# Debug

You can activate the debugging logs by manipulating the `DEBUG` environment variable. Example:

```bash
$ DEBUG=peer-star:* npm test
```

For file-specific `DEBUG` values, see the source code and look for usages of the `debug` package.

# Contribute

Peer-star app and the IPFS implementation in JavaScript is a work in progress. As such, there's a few things you can do right now to help out:

  * Check out [existing issues](https://github.com/ipfs-shipyard/peer-star-app/issues). This would be especially useful for modules in active development. Some knowledge of IPFS may be required, as well as the infrastructure behind it - for instance, you may need to read up on p2p and more complex operations like muxing to be able to help technically.
  * **Perform code reviews**. More eyes will help (a) speed the project along, (b) ensure quality, and (c) reduce possible future bugs.
  * **Add tests**. There can never be enough tests.

## Want to hack on peer-star-app?

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/contributing.md)

# License

MIT

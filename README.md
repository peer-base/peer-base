# peer-star-app

Peer-Star App support for real-time collaborative DApps built on top of IPFS

[![Build Status](https://travis-ci.org/ipfs-shipyard/peer-star-app.svg?branch=master)](https://travis-ci.org/ipfs-shipyard/peer-star-app)

* [Example app](examples/react-app)
* [How to run the example app](#run-example-app)

## Install

```bash
$ npm install peer-star-app
```

## Import

```js
const PeerStar = require('peer-star-app')
```

# Documentation

* [Code structure](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/CODE-STRUCTURE.md)
* [Protocol](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/PROTOCOL.md)

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

### js-IPFS node

A peer-star app comes with an IPFS node. You can access through `app.ipfs`. Example:

```js
console.log(await app.ipfs.id())
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

### App Events

#### `app.emit('error', err)`

#### `app.emit('peer connected', (peerInfo) => {})`

When a peer connects.

#### `app.emit('outbound peer connected', (peerInfo) => {})`

When a push connection is created.

#### `app.emit('inbound peer connected', (peerInfo) => {})`

When a pull connection is created.

#### `app.emit('peer disconnected', (peerInfo) => {})`

When a peer disconnects.

#### `app.emit('outbound peer disconnected', (peerInfo) => {})`

When a push connection ends.

#### `app.emit('inbound peer disconnected', (peerInfo) => {})`

When a pull connection ends.


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

Example:

```js
collaboration.shared.push('some element')
```

### Stop collaboration

```js
await collaboration.stop()
```

### Stop app

```js
await app.stop()
```

### Guess peer count

```js
app.peerCountGuess() // returns integer Number >= 0
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

## Contribute

Peer-star app and the IPFS implementation in JavaScript is a work in progress. As such, there's a few things you can do right now to help out:

  * Check out [existing issues](https://github.com/ipfs-shipyard/peer-star-app/issues). This would be especially useful for modules in active development. Some knowledge of IPFS may be required, as well as the infrastructure behind it - for instance, you may need to read up on p2p and more complex operations like muxing to be able to help technically.
  * **Perform code reviews**. More eyes will help (a) speed the project along, (b) ensure quality, and (c) reduce possible future bugs.
  * **Add tests**. There can never be enough tests.

### Want to hack on peer-star-app?

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/contributing.md)

## License

MIT

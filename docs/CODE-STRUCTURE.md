# peer-base - Code structure explanation

```
src/
├── app.js
├── collaboration
│   ├── connection-manager.js
│   ├── crdt.js
│   ├── index.js
│   ├── membership-gossip-frequency-henristic.js
│   ├── membership.js
│   ├── protocol.js
│   ├── pull-protocol.js
│   ├── push-protocol.js
│   ├── shared.js
│   └── store.js
├── common
│   ├── codec.js
│   ├── decode.js
│   ├── dias-peer-set.js
│   ├── encode.js
│   ├── handling-data.js
│   ├── peer-set.js
│   ├── ring.js
│   └── vectorclock.js
├── index.js
├── peer-count-guess.js
└── transport
    ├── app-transport.js
    ├── connection-manager.js
    ├── discovery.js
    ├── global-connection-manager.js
    ├── gossip.js
    └── ipfs.js
```

## `src/app.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/app.js)

Represents the application. Has a name (should be unique in the universe). After instantiated, ot should be started.

When started, starts a js-ipfs node and a peer count guess (explained later).

Maintains a list of all active collaborations for this peer.

Delivers membership gossip messages to each one of the registered collaborations.

## `src/peer-count-guess.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/app.js)

Observes overall gossip observed by the application (by listening to the app `gossip` event).

using that, for each gossip message, it extracts the source peer id and adds it to fast bloom filter (using the `asino` package). Using this filter, it tries maintaining an overall app-wide peer count guess.

## `src/common`

### `src/common/ring.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/common/ring.js)

A hash ring of peers. Peers can be added, removed, and inquired if they belong.

Can be inquired about the peer at any point in the ring.

Does all this by maintaining a sorted list of peers (points in the ring).

### `src/common/dias-peer-set.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/common/dias-peer-set.js)

Given a ring and a peer id (the self peer id), it computes the set of peers that are in the following positions:

* successor
* successor of successor
* at 1/5th of the ring
* at 1/4th of the ring
* at 1/3rd of the ring
* the successor of the node at half-way across the ring

### `src/common/peer-set.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/common/peer-set.js)

As a Set, but only for `PeerInfo` instances. Uniqueness by peer id. Exposes the JS `Set` API.

### `src/common/encode.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/common/encode.js)

Encodes data to be sent over the wire and stored. Uses msgpack for that.

### `src/common/decode.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/common/decode.js)

Decodes data from the network and storage. Uses msgpack for that.

## `src/transport`

Everything pertaining to app-wide transport and discovery, interfacing with libp2p.

### `src/transport/ipfs.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/transport/ipfs.js)

Creates the js-IPFS node. When doing that, it instantiates the AppTransport (see later) and defines that as the transport module.

It relays some app-transport events into the app itself.

### `src/transport/app-transport.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/transport/app-transport.js)

Wraps the original libp2p transport. Creates a ring from the discovered nodes. Maintains a list of inbound and outbound connections. Connects all these into the global connection manager (explained later).

Exposes a `discovery` object that libp2p will use.

Instantiates a connection manager that maintains connections to a subset of nodes.

### `src/transport/discovery.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/transport/discovery.js)

Wraps the native transport discovery and filters discovery events.

When a new peer is discovered, it's pushed into a queue.

From that queue, a peer gets randomly picked and, after a throttling period, it gets processed to inquire about whether that peer is interested in the application at cause.

To find out whether it's interested in the app, it tries connecting to it and then waiting for the pubsub subscription on the app topic (app name) to appear. If, after a given timeout, it doesn't happen, it gives up.

If the peer is interested, it's added to the hash ring. Otherwise, the peer is disconnected.

### `src/transport/global-connection-manager.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/transport/global-connection-manager.js)

Manages app-wide connections to other peers. It does that by keeping a list of inbound and outbound connections and a lust of collaborations per peer.

When told to disconnect, it removes that peer from the collaborations the peer is in. If the collaboration list for that peer is empty and there is an app-level inbound or outbound connection to that peer, that peer is not disconnected. This way, we only keep connected to peers that are interesting to the app and to any of the collaborations.

## `src/collaboration`

Collaboration-specific code.

### `src/collaboration/index.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/index.js)

Internally instantiated by the app. Exposes the internal Collaboration class. It has a collaboration store, keeps track of the collaboration membership (by delegating collaboration-specific membership messages) and helps defining the CRDT type of the collaboration.


### `src/collaboration/membership.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/membership.js)

Keeps tracks of collaboration members. Receives gossip messages from the app and incorporates into the membership set. Has an heuristic to define the frequency of the membership gossip.

Creates the DiasSet definition and passes it down to the collaboration-specific connection manager (see below).


### `src/collaboration/connection-manager.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/connection-manager.js)

Maintains a list of collaboration-specific inbound and outbound connections. Instantiates the protocol (see below). Maintains the ring of known peers passed in from the membership.

When ring changes happen, we debounce that event and then react to it by maintaining ourselves connected to the DiasSet of the collaboration peers. We do this by inquiring the dias set and then disconnecting to outbound peers we should no longer be connected to or connecting to peers we should be connected to.

### `src/collaboration/protocol.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/protocol.js)

Exposes a protocol handler and a dialer. The protocol handler delegates into the pull protocol (see below). The dialer delegates into the push protocol (see below).

### `src/collaboration/push-protocol.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/push-protocol.js)

For any given peer, is able to create a peer connection-handling stream as a pull stream.

Uses the store (see below) to provide a stream of CRDT deltas or the whole CRDT state.

Handles requests from the other peer to turn the stream into eager (default) or lazy mode.

In eager mode, it pushes all new deltas or state to the peer.

In lazy mode, it only pushes the local store vector clock.

### `src/collaboration/pull-protocol.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/pull-protocol.js)

For any given peer, is able to create a peer connection-handling stream as a pull stream.

This stream receives updates from the other peer and informs the other peer of local vector clock changes.

It's also responsible for:

* Asking the peer to start lazy mode (when a duplicate is received)
* Asking the peer to start eager mode (when a given message times out)

### `src/collaboration/store.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/store.js)

Collaboration store. Wraps the IPFS data store into a collaboration-specific namespace.

Stores the clock, the state and the deltas.

Can produce a delta stream.

Incorporates changes in causal order (by processing requests from a queue), rejecting the ones that are not. Is the main sync point and authority for causality.

Uses the shared CRDT (see below) to merge states and deltas to form the new state every time there is a change.

### `src/collaboration/shared.js`

[Link](https://github.com/ipfs-shipyard/peer-base/blob/master/src/collaboration/shared.js)

Exposes to the user the `collaboration.shared` API, where you have:

* `shared.value()`: returns the current CRDT external value.
* type-specific mutators.

Internally uses the delta-crdts package.

Incorporates changes from the store into the CRDT.

# peer-star-app - Protocol explanation

## Discovery

## Connection count throttling + app hashring building

Instead of announcing every peer that is discovered to the IPFS layer, we're going to do some filering on the discovery.

We're going to wrap the transport's object. This wrapper will listen to `peer:discovery` events and build a consistent hashring from the peer IDs that are part of the application. But how do we find whether the peer is part of the application? For that, we need to know whether it's interested in a specific `<application>` pub-sub topic.

When the discovery at the transport level finds a peer:

* dial to it, using the pub-sub protocol
* find out if it's interested in the <application> topic
* if it is, add it to the app hashring
* if it's not, disconnect from it

When a peer from this app hashring disconnects, remove it from the hash ring.

Every time this app hashring changes:
* compute the set of target peers (see below)
* for each peer this peer is connected to:
  * is it included in the target peer set (see below)?
    * no: disconnect from it
    * yes: do nothing
* for each target peer:
  * are we connected to it?
    * yes: do nothing
    * no: emit a `peer:discovery` event

This makes the peer only keep connected to the set of target peers (defined below) while the hashring changes.

### Computing the set of target peers

For a given hashring of peers, the set of target peers is composed by the union of:
  * the successor of the current node
  * the successor's successor
  * the node at +1/5th of the hash ring
  * the node at +1/4th of the hash ring
  * the node at +1/3rd of the hash ring
  * the node after +1/2 of the hash ring

These target peers will change as the hash ring constituency changes, as they are relative positions in the hash ring.

This set of target peers is called the **Dias-Peer-Set**.

## The collaboration membership gossip

This should give us a app-wide scalable pub-sub primitive when using floodsub.

Now, when pariticipating in a collaboration, a peer needs to know which peers are part of the collaboration.

Each collaboration has a unique identifier. By using the app-wide pub-sub primitive, they can use this topic to gossip and disseminate the membership of any collaboration.

A peer that is interested in a specific collaboration collects the members in the collaboration membership gossip, accumulates it and forwards it to other peers, thus making every node find out about each other.

On a computed interval, we broadcast the has of the sorted set of known peers. If we detect that someone else has a different view of the membership that we have, we then send the whole membership set.

When we receive a membership message on this channel, we incorporate it to the set of known peers in this collaboration.


### Adaptive gossip dissemination frequency heuristic

In order to keep the gossip traffic from overwhelming the network and the peers, the frequency of gossip messages needs to be a random number bound to be inversively proportional to the size of the peer set and proportional to the urgency.

The urgency is defined by the number of changes to the app peer set that have occurred since the last gossip broadcast. This urgency (and thus the broadcast frequency) needs to be re-computed every time the app peer set changes.


## Collaboration-level messaging

Now that we have a way of maintaing the peer set for a given collaboration, we need to be able to cross-replicate CRDT instances that the peers are collaborating with.

For this, each peer keeps a collaboration-level hashring, placing all the peer IDs the peer gets from the collaboration membership gossip.

Every time this hashring changes, the peer calculates the __Dias-Peer-Set__.

For each of the peers in this set:
* Is this collaboration-peer connected to this collaboration-peer?
  * yes: do nothing
  * no: connect to it

For each of the remaining peers in the collaboration hashring:
  * disconnect from it if we're connected.

Note: Remember that these connections are at the collaboration level. A peer may be running multiple collaborations at the same time, as it also may be connected to other peers because of app-level gossip. Be wise about this.


## Collaboration-level P2P replication protocol

When a peer intitiates a connection to another peer, it acts as a pusher over that connection.

When a peer receives a connection request from another peer, it acts as a puller over that connection.

### Push Protocol

Waits for a presentation message from the other side.

When receives the presentation message (containing the current vector clock), it starts on eager mode, pushing the deltas or state that the other peer may need.

When asked from the other side to downgrade to lazy mode, it sets itself on lazy mode, not sending further updates. While in this mode, it only sends updates to the local vector clock, so that the other side is informed that this side has information it may not have.

When asked from the other side to upgrade to eager mode, it actively tries to keep the other side in sync with itself.

### Pull Protocol

When the connection is created, it firts sends it's presentation, containing the local vector clock.

After that, it may start receiving messages each one containing a vector clock and a delta or a state.

When receiving these messages, it tries to incorporate them in the local store. The store imposes causal order (by looking at the vector clock). If the message has already been processed, this peer sends a pessage to the pusher to turn it into lazy mode.

When in lazy mode, the peer gets vector clock updates from the remote peer. When it receives a vector clock, it checks to see whether the local store contains it. If it does not contain it, it waits a bit to receive it from another peer. If, after that timeout, the store hasn't yet received it, it asks the oter side to switch to eager mode.

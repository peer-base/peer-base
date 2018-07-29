# Performance tests

Even though very basic, you can run a bunch of performance tests. These tests mainly measure the time it takes for all the nodes to get in sync after operations are performed.

These tests live in the `tests/performance` directory.

To start them, you can use the command-line `mocha` command. Example:

```
$ mocha test/performance/one-seed-many-replicas
```

Each one of the tests in this directory accepts two arguments from the command-line: the websocket-star server address and the number of peers.

Example:

```
$ mocha test/performance/one-seed-many-replicas.js /dns4/ws-star2.sjc.dwebops.pub/tcp/443/wss/p2p-websocket-star 20

...

Going to use websocket-star server at address /dns4/ws-star2.sjc.dwebops.pub/tcp/443/wss/p2p-websocket-star
Going to use 1 seed and 20 replicas
```

At the end of each test a line should be written with the time it took to reach convergence. Example:

```
Convergence reached for 10 replicas in 75 seconds
```

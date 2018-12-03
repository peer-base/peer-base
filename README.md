# peer-star-app

Build real-time collaborative DApps on top of IPFS

[![Build Status](https://travis-ci.org/ipfs-shipyard/peer-star-app.svg?branch=master)](https://travis-ci.org/ipfs-shipyard/peer-star-app) [![Greenkeeper badge](https://badges.greenkeeper.io/ipfs-shipyard/peer-star-app.svg)](https://greenkeeper.io/) [![made by Protocol Labs](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](https://protocol.ai)


* [Example app](examples/react-app)
* [How to run the example app](#run-example-app)

# Documentation

* [Code structure](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/CODE-STRUCTURE.md)
* [Protocol](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/PROTOCOL.md)
* [Performance tests](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/PERFORMANCE-TESTS.md)
* [Membership Simulator](https://github.com/ipfs-shipyard/peer-star-app/blob/master/docs/MEMBERSHIP-SIM.md)

## Install

```bash
$ npm install peer-star-app
```

## Import

```js
const PeerStar = require('peer-star-app')
```

# API

[API docs](docs/API.md)

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

## Testing a deployed pinner

If you want to make sure your deployed pinner is working correctly, there is a
utility-test that you can run with `npm run test:post-deploy` that will ensure
your deployed pinner works correctly.

First you need to export environment variables to ensure the assertion values
are correct for your environment, then you can run the test. Example:

```
export PEER_STAR_APP_NAME=peer-pad/2
export PEER_STAR_SWARM_ADDRESS=/dns4/localhost/tcp/9090/ws/p2p-websocket-star
export PEER_STAR_PINNER_ID=Qmb9WDZUnUzEmZwkbMMGi4cV65F1sqcQa49dfZy9baRBJo
npm run test:post-deploy
```

# Infrastructure

The infrastructure for peer-star and related applications is managed via
https://github.com/ipfs-shipyard/peer-star-infra/

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

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/CONTRIBUTING.md)

# License

MIT

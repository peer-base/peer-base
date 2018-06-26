import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

import PeerStarApp from 'peer-star-app'

class App extends Component {
  constructor () {
    super()
    this.state = {
      count: 0,
      peers: new Set(),
      appPeerCountEstimate: 0
    }
    this.onIncrementClick = this.onIncrementClick.bind(this)

    this._app = PeerStarApp('peer-star-counter-example-app', {
      ipfs: {
        swarm: [ '/ip4/127.0.0.1/tcp/9090/ws/p2p-websocket-star' ]
      }
    })
    this._app.start()
      .then(() => {
        console.log('app started')

        setInterval(() => {
          this.setState({ appPeerCountEstimate: this._app.peerCountEstimate() })
        }, 2000)

        this._app.collaborate('peer-star-counter-example', 'gcounter')
          .then((collab) => {
            console.log('collaboration started')
            this._collab = collab

            this.setState({ count: collab.shared.value() })

            collab.shared.on('state changed', () => {
              this.setState({ count: collab.shared.value() })
            })

            collab.on('membership changed', (peers) => {
              this.setState({ peers })
              console.log('membership changed:', peers)
            })
          })
      })
  }

  onIncrementClick () {
    this._collab.shared.inc()
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to Peer-Star Counter app</h1>
        </header>
        <p className="App-intro">
          Grow-only Counter: {this.state.count}
        </p>
        <button onClick={this.onIncrementClick}>+</button>
        <p>Have {this.state.peers.size} peers for this collaboration</p>
        <p>App-wide peer count estimate: {this.state.appPeerCountEstimate} peers</p>
      </div>
    );
  }
}

export default App;

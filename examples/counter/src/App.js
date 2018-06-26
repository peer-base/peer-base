import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

import PeerStarApp from 'peer-star-app'

import GCounterCollaboration from './GCounterCollaboration'
import ArrayCollaboration from './ArrayCollaboration'

class App extends Component {
  constructor () {
    super()
    this.state = {
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
          App-wide peer count estimate: {this.state.appPeerCountEstimate} peers
        </p>

        <GCounterCollaboration app={this._app} name="peer-star-app-example-counter" />

        <ArrayCollaboration app={this._app} name="peer-star-app-example-array" />

      </div>
    );
  }
}

export default App;

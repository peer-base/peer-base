import React, { Component } from 'react';
import { HashRouter as Router, Route, Link } from 'react-router-dom'
import logo from './logo.svg';
import './App.css';

import PeerStarApp from 'peer-star-app'

import Home from './Home'
import routes from './routes'

class App extends Component {
  constructor () {
    super()
    this.state = {
      appPeerCountEstimate: 0
    }

    this._app = PeerStarApp('peer-star-example-app', {
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

  render() {
    console.log('APP RENDER')
    return (
      <Router>
        <div className="App">
            <header className="App-header">
              <img src={logo} className="App-logo" alt="logo" />
              <h1 className="App-title"><Link to="/">Welcome to Peer-Star Counter app</Link></h1>
            </header>

            <p className="App-intro">
              App-wide peer count estimate: {this.state.appPeerCountEstimate} peers
            </p>

              <div>
                <Route exact path="/" component={Home} />
                {routes(this._app).map((route, i) => <Route key={i} {...route} />)}
              </div>
        </div>
      </Router>
    );
  }

  shouldComponentUpdate () {
    return false
  }
}

export default App;

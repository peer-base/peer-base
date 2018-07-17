import React, { Component } from 'react';
import { HashRouter as Router, Route } from 'react-router-dom'
import logo from './logo.svg';
import './App.css';

import PeerStarApp from 'peer-star-app'

import Home from './Home'
import CreateKey from './CreateKey'
import GCounterCollaboration from './GCounterCollaboration'
import ArrayCollaboration from './ArrayCollaboration'
import TextCollaboration from './TextCollaboration'
import DiscussionTreeCollaboration from './DiscussionTreeCollaboration'

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
    const routes = [
      {
        path: '/counter/:name/:keys',
        render: (props) => (
          <GCounterCollaboration
            match={props.match}
            keys={props.match.params.keys}
            app={this._app}
            name={props.match.params.name} /> )
      },
      {
        path: '/counter',
        component: CreateKey,
        exact: true
      }
      // {
      //   path: '/array',
      //   component: CreateKey
      // },
      // {
      //   path: '/array/:keys',
      //   render: (props) => (
      //     <ArrayCollaboration
      //       match={props.match}
      //       app={this._app}
      //       name="peer-star-app-example-counter" /> )
      // }
    ]

    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to Peer-Star Counter app</h1>
        </header>

        <p className="App-intro">
          App-wide peer count estimate: {this.state.appPeerCountEstimate} peers
        </p>

        <Router>
          <div>
            <Route exact path="/" component={Home} />

            {routes.map((route, i) => <Route key={i} {...route} />)}
          </div>
        </Router>

      </div>
    );
  }
}

export default App;

import React, { Component } from 'react';
import PropTypes from 'prop-types'

class Collaboration extends Component {
  constructor (props) {
    super(props)
    this.state = {
      value: undefined,
      peers: new Set(),
      inboundConnectionCount: 0,
      outboundConnectionCount: 0
    }
    this.onIncrementClick = this.onIncrementClick.bind(this)

    props.app.start().then(() => {
      props.app.collaborate(props.name, props.type)
        .then((collab) => {
          console.log('collaboration started')
          this._collab = collab

          this.setState({ value: collab.shared.value() })

          collab.shared.on('state changed', () => {
            this.setState({ value: collab.shared.value() })
          })

          collab.on('membership changed', (peers) => {
            this.setState({ peers })
            console.log('membership changed:', peers)
          })

          setInterval(() => {
            this.setState({
              inboundConnectionCount: collab.inboundConnectionCount(),
              outboundConnectionCount: collab.outboundConnectionCount()
            })
          }, 2000)
        })
    })
  }

  onIncrementClick () {
    this._collab.shared.inc()
  }

  render() {
    return (
      <div>
        <hr />
        <h1>G-Counter</h1>
        <p className="App-intro">
          Value: {this.state.value}
        </p>
        <button onClick={this.onIncrementClick}>+</button>
        <p>Have {this.state.peers.size} peers for this collaboration (myself included)</p>
        <p>Outbound connection count: {this.state.outboundConnectionCount}</p>
        <p>Inbound connection count: {this.state.inboundConnectionCount}</p>
      </div>
    );
  }
}


Collaboration.propTypes = {
  app: PropTypes.object,
  name: PropTypes.string,
  type: PropTypes.string
}

export default Collaboration;

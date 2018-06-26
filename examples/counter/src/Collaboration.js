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
}


Collaboration.propTypes = {
  app: PropTypes.object,
  name: PropTypes.string,
  type: PropTypes.string
}

export default Collaboration;

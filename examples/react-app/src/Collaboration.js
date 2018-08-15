import { Component } from 'react';
import PropTypes from 'prop-types'
import { keys as Keys } from 'peer-star-app'

class Collaboration extends Component {
  state = {
    value: undefined,
    peers: new Set(),
    inboundConnectionCount: 0,
    outboundConnectionCount: 0
  }

  constructor (props) {
    super(props)

    console.log('props.match:', props.match)

    Keys.uriDecode(props.keys).then((keys) => {
      console.log('keys:', keys)

      props.app.start().then(() => {
        props.app.collaborate(props.name, props.type, { keys })
          .then((collab) => {
            console.log('collaboration started')
            let value
            this._collab = collab

            const onStateChanged = () => {
              const newValue = collab.shared.value()

              if (this.onValueChanged) {
                const oldValue = value
                value = newValue
                this.onValueChanged(oldValue, newValue)
              }
              this.setState({ value: newValue })
            }

            onStateChanged()

            collab.shared.on('state changed', onStateChanged)

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
    })
  }
}


Collaboration.propTypes = {
  app: PropTypes.object,
  name: PropTypes.string,
  type: PropTypes.string
}

export default Collaboration;

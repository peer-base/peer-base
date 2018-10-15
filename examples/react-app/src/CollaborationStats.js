import React from 'react'
import { withCollaboration, withCollaborationMembership } from 'peer-star-react'

function MembershipCount ({ peers }) {
  return (<p>Have {peers.size} peers for this collaboration (myself included)</p>)
}

class ConnectionCount extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      outboundConnectionCount: 0,
      inboundConnectionCount: 0
    }
  }

  render () {
    return (
      <div>
        <p>Outbound connection count: {this.state.outboundConnectionCount}</p>
        <p>Inbound connection count: {this.state.inboundConnectionCount}</p>
      </div>
    )
  }

  componentDidMount () {
    const { collaboration } = this.props
    this._interval = setInterval(() => {
      this.setState({
        inboundConnectionCount: collaboration.inboundConnectionCount(),
        outboundConnectionCount: collaboration.outboundConnectionCount()
      })
    }, this.props.interval || 2000)
  }

  componentWillUnmount () {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }
}

export default class CollaborationStats extends React.Component {
  constructor (props) {
    super(props)
    this.MembershipCount = withCollaborationMembership(this.props.collaboration)(MembershipCount)
    this.ConnectionCount = withCollaboration(this.props.collaboration)(ConnectionCount)
  }

  render () {
    return (
      <div>
        <this.MembershipCount />
        <this.ConnectionCount />
      </div>
    )
  }
}

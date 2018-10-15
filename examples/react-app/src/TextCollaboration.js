import React from 'react'
import Diff from 'fast-diff'
import { withCollaboration, withCollaborationLiveValue } from 'peer-star-react'
import NetworkVis from 'peer-star-network-vis-react'
import CollaborationStats from './CollaborationStats'

function LiveValue ({ value }) {
  return (
    <div className='App-intro'>
      Value: <pre>{JSON.stringify(value)}</pre>
    </div>
  )
}

class TextCollaboration extends React.Component {
  constructor (props) {
    super(props)

    this.state = {
      value: ''
    }

    this.LiveValue = withCollaborationLiveValue(this.props.collaboration)(LiveValue)
    this.NetworkVis = withCollaboration(this.props.collaboration)(NetworkVis)
    this.Stats = withCollaboration(this.props.collaboration)(CollaborationStats)

    this.onTextChange = this.onTextChange.bind(this)
    this.onValueChange = this.onValueChange.bind(this)
    this.onRemoteChange = this.onRemoteChange.bind(this)
  }

  onTextChange (event) {
    this.applyChanges(event.target, event.target.value)
  }

  onValueChange () {
    const oldText = this.state.value
    const newText = this.props.collaboration.shared.value().join('')
    this.setState({ value: newText })
    this.onRemoteChange(oldText, newText)
  }

  componentDidMount () {
    this.props.collaboration.on('state changed', this.onValueChange)
    this.setState({
      value: this.props.collaboration.shared.value().join('')
    })
  }

  componentWillUnmount () {
    this.props.collaboration.removeListener('state changed', this.onValueChange)
  }

  applyChanges (target, newText) {
    const { collaboration } = this.props
    const oldText = this.state.value
    const diffs = Diff(oldText, newText)
    let pos = 0
    diffs.forEach((d) => {
      if (d[0] === 0) { // EQUAL
        pos += d[1].length
      } else if (d[0] === -1) { // DELETE
        const delText = d[1]
        for (let i = delText.length - 1; i >= 0; i--) {
          collaboration.shared.removeAt(pos + i)
        }
      } else { // INSERT
        d[1].split('').forEach((c) => {
          collaboration.shared.insertAt(pos, d[1])
        })
        pos += d[1].length
      }
    })
  }

  onRemoteChange (oldText, newText) {
    console.log('onValueChanged', oldText, newText)
    const textArea = this.refs.collaborativeTextArea
    if (textArea.value === newText) {
      console.log('value is the same', textArea.value)
      return
    }
    const cursor = {
      start: textArea.selectionStart,
      end: textArea.selectionEnd
    }

    const diffs = Diff(oldText, newText)

    let pos = 0
    diffs.forEach((d) => {
      if (d[0] === 0) { // EQUAL
        pos += d[1].length
      } else if (d[0] === -1) { // DELETE
        const delText = d[1]
        if (pos < cursor.start) {
          cursor.start -= delText.length
        }
        if (pos < cursor.end) {
          cursor.end -= delText.length
        }
      } else { // INSERT
        const insertText = d[1]
        if (pos < cursor.start) {
          cursor.start += insertText.length
        }
        if (pos < cursor.end) {
          cursor.end += insertText.length
        }
      }
    })

    this.refs.collaborativeTextArea.value = newText
    this.refs.collaborativeTextArea.selectionStart = cursor.start
    this.refs.collaborativeTextArea.selectionEnd = cursor.end
  }

  render () {
    return (
      <div>
        <hr />
        <h1>Text</h1>
        <this.LiveValue />

        <div>
          <textarea
            style={{ width: '100%', height: '200px' }}
            ref='collaborativeTextArea'
            onChange={this.onTextChange} />
        </div>

        <this.Stats />
        <this.NetworkVis />
      </div>
    )
  }
}

export default TextCollaboration

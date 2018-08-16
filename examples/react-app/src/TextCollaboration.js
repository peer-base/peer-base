import React from 'react';
import Collaboration from './Collaboration'
import Diff from 'fast-diff'
import NetworkVis from 'peer-star-network-vis-react'

class TextCollaboration extends Collaboration {
  constructor (props) {
    super(Object.assign({}, props, { type: 'rga' }))
    this.onTextChange = this.onTextChange.bind(this)
  }

  onTextChange (event) {
    this.applyChanges(event.target, event.target.value)
  }

  applyChanges (target, newText) {
    const oldText = (this.state.value && this.state.value.join('')) || ''
    const diffs = Diff(oldText, newText)
    let pos = 0
    diffs.forEach((d) => {
      if (d[0] === 0) { // EQUAL
        pos += d[1].length
      } else if (d[0] === -1) { // DELETE
        const delText = d[1]
        for (let i = delText.length - 1; i >=0; i--) {
          this._collab.shared.removeAt(pos + i)
        }
      } else { // INSERT
        d[1].split('').forEach((c) => {
          this._collab.shared.insertAt(pos, d[1])
        })
        pos += d[1].length
      }
    })
  }

  onValueChanged (oldText=[], newText) {
    console.log('onValueChanged', oldText, newText)
    const textArea = this.refs.collaborativeTextArea
    oldText = oldText.join('')
    newText = newText.join('')
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

  render() {
    return (
      <div>
        <hr />
        <h1>Text</h1>
        <div className="App-intro">
          Value: <pre>{JSON.stringify(this.state.value)}</pre>
        </div>

        <div>
          <textarea
            style={{width: '100%', height: '200px'}}
            ref="collaborativeTextArea"
            onChange={this.onTextChange} />
        </div>

        <p>Have {this.state.peers.size} peers for this collaboration (myself included)</p>
        <p>Outbound connection count: {this.state.outboundConnectionCount}</p>
        <p>Inbound connection count: {this.state.inboundConnectionCount}</p>
        <NetworkVis collaboration={this._collab} />
      </div>
    );
  }
}

export default TextCollaboration

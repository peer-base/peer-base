import React from 'react'
import { withCollaborationFromApp } from 'peer-star-react'
import CreateKey from './CreateKey'
import GCounterCollaboration from './GCounterCollaboration'
import ArrayCollaboration from './ArrayCollaboration'
import TextCollaboration from './TextCollaboration'
import DiscussionTreeCollaboration from './DiscussionTreeCollaboration'

const routes = (app) => {
  return [
    {
      path: '/counter/:name/:keys',
      render: (props) => {
        console.log('RENDER COUNTER')
        return React.createElement(
          withCollaborationFromApp(app, props.match.params.name, 'gcounter', props.match.params)(GCounterCollaboration))
      }
    },
    {
      path: '/counter',
      component: CreateKey,
      exact: true
    },
    {
      path: '/array/:name/:keys',
      render: (props) => (
        React.createElement(
          withCollaborationFromApp(app, props.match.params.name, 'rga', props.match.params)(ArrayCollaboration))
      )
    },
    {
      path: '/array',
      component: CreateKey,
      exact: true
    },
    {
      path: '/text/:name/:keys',
      render: (props) => (
        React.createElement(
          withCollaborationFromApp(app, props.match.params.name, 'rga', props.match.params)(TextCollaboration))
      )
    },
    {
      path: '/text',
      component: CreateKey,
      exact: true
    },
    {
      path: '/discussion/:name/:keys',
      render: (props) => (
        React.createElement(
          withCollaborationFromApp(app, props.match.params.name, 'discussion-tree', props.match.params)(DiscussionTreeCollaboration))
      )
    },
    {
      path: '/discussion',
      component: CreateKey,
      exact: true
    }
  ]
}

export default routes

import React from 'react';
import { Link } from 'react-router-dom';

export default () => (
  <div>
    <p>Create new:</p>
    <ul>
      <li><Link to="/counter">Counter</Link></li>
      <li><Link to="/array">Array</Link></li>
      <li><Link to="/text">Text</Link></li>
      <li><Link to="/discussion">Discussion</Link></li>
    </ul>
  </div>
)
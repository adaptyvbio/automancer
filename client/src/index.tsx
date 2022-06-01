import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { Application, Settings } from './application';

import '../lib/styles.css';
import 'material-symbols';


export default function createClient(element: Element, options: {
  settings: Settings;
  saveSettings?(settings: Settings): void;
}) {
  ReactDOM.render(
    <Application initialSettings={options.settings} />,
    element
  );
}

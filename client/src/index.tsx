/// <reference path="global-interfaces.d.ts" />

import * as React from 'react';
import { createRoot } from 'react-dom/client';

import { BrowserApp } from './browser-app';

import '../lib/styles.css';
import 'material-symbols';


export function createBrowserApp(element: Element) {
  let root = createRoot(element);
  root.render(<BrowserApp />);
}

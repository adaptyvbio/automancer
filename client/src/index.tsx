/// <reference path="global-interfaces.d.ts" />

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import { BrowserApp } from './browser-app';

import '../lib/styles.css';
import 'material-symbols';

export { Application } from './application';
export { MessageBackend } from './backends/message';
export { Startup } from './startup';
export { React, ReactDOM };


export function createBrowserApp(element: Element) {
  let root = createRoot(element);
  root.render(<BrowserApp />);
}

/// <reference path="global-interfaces.d.ts" />

import * as React from 'react';
import { createRoot } from 'react-dom/client';

import { Application, Settings } from './application';
import { BrowserApp } from './browser-app';
import { Startup } from './startup';

import '../lib/styles.css';
import 'material-symbols';


export { MessageBackend } from './backends/message';

export default function createClient(element: Element, options: {
  settings: Settings;
  saveSettings?(settings: Settings): void;
}) {
  let root = createRoot(element);
  root.render(<Application initialSettings={options.settings} />);
}


export function createBrowserApp(element: Element) {
  let root = createRoot(element);
  root.render(<BrowserApp />);
}

import htm from 'https://cdn.skypack.dev/htm';
import { React } from 'pr1';

import mainStyles from './index.css' assert { type: 'css' };


const html = htm.bind(React.createElement);

export const namespace = 'simple';
export const styleSheets = [mainStyles];


export function getGeneralTabs() {
  return [
    {
      id: 'simple.example',
      label: 'Example',
      icon: 'rocket',
      component: ExampleTab
    }
  ];
}

export function ExampleTab(props) {
  return html`
    <main>
      <h1 className="rocket-title">Rocket</h1>
    </main>
  `;
}

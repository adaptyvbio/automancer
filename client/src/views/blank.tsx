import * as React from 'react';

import { ViewBody, ViewHeader } from '../retroflex';


export default class ViewBlank extends React.Component {
  render() {
    return (
      <>
        <ViewHeader />
        <ViewBody>
          <div>hi</div>
        </ViewBody>
      </>
    );
  }
}

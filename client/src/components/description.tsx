import React from 'react';

import descriptionStyles from '../../styles/components/description.module.scss';


export function Description(props: React.PropsWithChildren<{}>) {
  return (
    <div className={descriptionStyles.root}>
      {props.children}
    </div>
  );
}

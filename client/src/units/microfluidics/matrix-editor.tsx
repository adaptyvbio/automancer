import * as React from 'react';

import { type Matrix, namespace } from '.';
import type { MatrixEditorInstance, MatrixEditorProps } from '..';
import * as Form from '../../components/standard-form';


export class MatrixEditor extends React.Component<MatrixEditorProps<Matrix>> implements MatrixEditorInstance<Matrix> {
  render() {
    let models = this.props.host.state.executors[namespace].models;

    return (
      <>
        <div className="header header--2">
          <h2>Microfluidics</h2>
        </div>

        <Form.Select
          label="Chip model"
          onInput={(modelId) => {
            this.props.setMatrix({ modelId });
          }}
          options={[
            { id: null, label: 'None' },
            ...Object.values(models).map((model) => ({
              id: model.id,
              label: model.name
            })),
          ]}
          value={this.props.matrix.modelId} />
      </>
    );
  }
}

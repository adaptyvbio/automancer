import { Component, RefObject } from 'react';

import viewStyles from '../../styles/components/view.module.scss';

import * as util from '../util';
import { Pool } from '../util';
import { Button } from './button';
import { TextEditor, TextEditorProps } from './text-editor';


export type DocumentEditorProps = TextEditorProps & {
  refTextEditor: RefObject<TextEditor>;
};

export interface DocumentEditorState {

}

export class DocumentEditor extends Component<DocumentEditorProps, DocumentEditorState> {
  pool = new Pool();

  constructor(props: DocumentEditorProps) {
    super(props);

    this.state = {};
  }

  override render() {
    if (this.props.documentItem.textModel) {
      return (
        <TextEditor {...this.props} ref={this.props.refTextEditor} />
      );
    }

    let slotSnapshot = this.props.documentItem.slotSnapshot;

    if (slotSnapshot.status === 'loading') {
      return null;
    }

    return (
      <div className={util.formatClass(viewStyles.blankOuter)}>
        <div className={viewStyles.blankInner}>
          {(() => {
            switch (slotSnapshot.status) {
              case 'prompt':
                return (
                  <>
                    <p>Please grant read and write permissions on this file to continue.</p>

                    <div className={viewStyles.blankActions}>
                      <Button onClick={() => {
                        this.pool.add(async () => {
                          await slotSnapshot.model.request!();
                        });
                      }}>Open protocol</Button>
                    </div>
                  </>
                );
              case 'missing':
                return (
                  <>
                    <p>This file is missing.</p>

                    {/* <div className={viewStyles.blankActions}>
                      <Button onClick={() => {
                        this.pool.add(async () => {
                          // ...
                        });
                      }}>Create</Button>
                    </div> */}
                  </>
                );
              default:
                return <p>Status: {slotSnapshot.status}</p>
            }
          })()}
        </div>
      </div>
    );
  }
}

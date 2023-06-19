import * as React from 'react';

import viewStyles from '../../styles/components/view.module.scss';

import { DocumentItem } from '../views/draft';
import * as util from '../util';
import { Button } from './button';
import { Pool } from '../util';
import { TextEditor, TextEditorProps } from './text-editor';
import { HostDraftCompilerResult } from '../interfaces/draft';


export type DocumentEditorProps = TextEditorProps;

export interface DocumentEditorState {

}

export class DocumentEditor extends React.Component<DocumentEditorProps, DocumentEditorState> {
  pool = new Pool();

  constructor(props: DocumentEditorProps) {
    super(props);

    this.state = {};
  }

  override render() {
    if (this.props.documentItem.textModel) {
      return (
        <TextEditor {...this.props} />
      );
    }

    let slotSnapshot = this.props.documentItem.slotSnapshot;

    if (!slotSnapshot.document) {
      return (
        <div className={util.formatClass(viewStyles.blankOuter)}>
          <div className={viewStyles.blankInner}>
            <p>This file is missing.</p>
          </div>
        </div>
      );
    }

    if (!slotSnapshot.document.readable) {
      return (
        <div className={util.formatClass(viewStyles.blankOuter)}>
          <div className={viewStyles.blankInner}>
            <p>Please grant read and write permissions on this file to continue.</p>

            <div className={viewStyles.blankActions}>
              <Button onClick={() => {
                this.pool.add(async () => {
                  await slotSnapshot.document!.model.request!();
                });
              }}>Open protocol</Button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }
}

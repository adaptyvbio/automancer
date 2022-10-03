import * as monaco from 'monaco-editor';
import * as React from 'react';
import seqOrd from 'seq-ord';
import Split from 'react-split-grid';

import { TitleBar } from '../../components/title-bar';
import * as util from '../../util';

import editorStyles from '../../../styles/components/editor.module.scss';
import viewStyles from '../../../styles/components/view.module.scss';



export class ViewSplit extends React.Component<any, any> {
  refEditor = React.createRef<HTMLDivElement>();
  refTitleBar = React.createRef<TitleBar>();

  constructor(props: any) {
    super(props);

    this.state = {
      cursorPosition: null,
      dragging: false,
      subtitle: null,
      subtitleVisible: false
    };
  }

  componentDidMount() {
    let editor = monaco.editor.create(this.refEditor.current!, {
      value: `const animals = ['pigs', 'goats', 'sheep'];

const count = animals.push('cows');
console.log(count);
// expected output: 4
console.log(animals);
// expected output: Array ["pigs", "goats", "sheep", "cows"]

animals.push('chickens', 'cats', 'dogs');
console.log(animals);
`,
      automaticLayout: true,
      // contextmenu: false,
      language: 'javascript',
      minimap: { enabled: false },
      occurrencesHighlight: false,
      renderWhitespace: 'trailing',
      scrollBeyondLastLine: true,
      selectionHighlight: false,
      tabSize: 2,
      readOnly: false,
      padding: {
        top: 4,
        bottom: 4
      }
    });

    editor.onDidChangeCursorPosition((event) => {
      this.setState({ cursorPosition: event.position });
    });

    editor.onDidBlurEditorText(() => {
      this.setState({ cursorPosition: null });
    });

    editor.onDidFocusEditorText(() => {
      this.setState({ cursorPosition: editor.getPosition() });
    });
  }

  render() {
    return (
      <main className={viewStyles.root}>
        <TitleBar
          title="Split"
          subtitle={this.state.subtitle}
          subtitleVisible={this.state.subtitleVisible}
          ref={this.refTitleBar} />

        <div className={util.formatClass(viewStyles.contents, editorStyles.root)}>
          {/* <button type="button" className="btn" onClick={() => {
            this.refTitleBar.current?.notify();
          }}>Notify</button>
          <button type="button" className="btn" onClick={() => {
            this.setState({
              subtitle: 'Foo',
              subtitleVisible: !this.state.subtitleVisible
            });
          }}>Toggle subtitle visible</button>
          <button type="button" className="btn" onClick={() => {
            this.setState({
              subtitle: null,
              subtitleVisible: false
            });
          }}>Remove subtitle</button> */}
          <Split
            onDragStart={() => {
              this.setState({ dragging: true });
            }}
            onDragEnd={() => {
              this.setState({ dragging: false });
            }}
            snapOffset={200}
            render={({
              getGridProps,
              getGutterProps,
            }) => (
              <div className={editorStyles.panels} {...getGridProps()}>
                <div className={editorStyles.editorRoot}>
                  <div className={editorStyles.editorMonaco} ref={this.refEditor} />
                </div>
                <div className={util.formatClass({ '_dragging': this.state.dragging })} {...getGutterProps('column', 1)} />
                <div />
              </div>
            )}
          />
          <div className={editorStyles.infobarRoot}>
            <div className={editorStyles.infobarLeft}>
              {this.state.cursorPosition && (
                <span className={editorStyles.infobarItem}>Ln {this.state.cursorPosition.lineNumber}, Col {this.state.cursorPosition.column}</span>
              )}
            </div>
            <div className={editorStyles.infobarRight}>
              <div>Foo</div>
            </div>
          </div>
        </div>
      </main>
    );
  }
}

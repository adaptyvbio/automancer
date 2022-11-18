import * as monaco from 'monaco-editor';
import * as React from 'react';
import seqOrd from 'seq-ord';
import Split from 'react-split-grid';

import { TabNav } from '../../components/tab-nav';
import { TitleBar } from '../../components/title-bar';
import * as util from '../../util';

import descriptionStyles from '../../../styles/components/description.module.scss';
import diagnosticsStyles from '../../../styles/components/diagnostics.module.scss';
import formStyles from '../../../styles/components/form.module.scss';
import editorStyles from '../../../styles/components/editor.module.scss';
import viewStyles from '../../../styles/components/view.module.scss';
import { Icon } from '../../components/icon';


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
      suggestLineHeight: 24,
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

    // editor.trigger('source - use any string you like', 'editor.action.triggerSuggest', {});
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
                <TabNav entries={[
                  { id: 'report',
                    label: 'Report',
                    contents: () => (
                      <div className={util.formatClass(formStyles.main2, descriptionStyles.root)}>
                        <div className={diagnosticsStyles.list}>
                          <div className={util.formatClass(diagnosticsStyles.entryRoot, diagnosticsStyles.entryRootError)}>
                            <Icon name="report" className={diagnosticsStyles.entryIcon} />
                            <div className={diagnosticsStyles.entryTitle}>Invalid line</div>
                            <button type="button" className={diagnosticsStyles.entryLocation}>foo.yml 13:8</button>
                            <p className={diagnosticsStyles.entryDescription}>This line contains a syntax error. See the <a href="#">documentation</a> for details.</p>
                          </div>
                          <div className={util.formatClass(diagnosticsStyles.entryRoot, diagnosticsStyles.entryRootError)}>
                            <Icon name="report" className={diagnosticsStyles.entryIcon} />
                            <div className={diagnosticsStyles.entryTitle}>Invalid line</div>
                            <button type="button" className={diagnosticsStyles.entryLocation}>foo.yml 13:8</button>
                            <p className={diagnosticsStyles.entryDescription}>This line contains a syntax error. See the <a href="#">documentation</a> for details.</p>
                            <p className={diagnosticsStyles.entrySource}>Source: Parsers › Shorthands</p>
                          </div>
                          <div className={util.formatClass(diagnosticsStyles.entryRoot, diagnosticsStyles.entryRootWarning)}>
                            <Icon name="warning" className={diagnosticsStyles.entryIcon} />
                            <div className={diagnosticsStyles.entryTitle}>Invalid line</div>
                            <button type="button" className={diagnosticsStyles.entryLocation}>foo.yml 13:8</button>
                            <p className={diagnosticsStyles.entryDescription}>This line contains a syntax error. See the <a href="#">documentation</a> for details.</p>
                            <p className={diagnosticsStyles.entrySource}>Source: Parsers › Shorthands</p>
                          </div>
                        </div>

                        <div className={util.formatClass(diagnosticsStyles.reportRoot)}>
                          <Icon name="pending" className={diagnosticsStyles.reportIcon} />
                          <div className={diagnosticsStyles.reportTitle}>Compiling...</div>
                        </div>

                        <div className={util.formatClass(diagnosticsStyles.reportRoot, diagnosticsStyles.reportRootError)}>
                          <Icon name="report" className={diagnosticsStyles.reportIcon} />
                          <div className={diagnosticsStyles.reportTitle}>2 errors and 1 warning</div>
                          <p className={diagnosticsStyles.reportDescription}>Ready to start</p>
                        </div>

                        <div className={util.formatClass(diagnosticsStyles.reportRoot, diagnosticsStyles.reportRootSuccess)}>
                          <Icon name="new_releases" className={diagnosticsStyles.reportIcon} />
                          <div className={diagnosticsStyles.reportTitle}>All tests passed</div>
                          <p className={diagnosticsStyles.reportDescription}>Ready to start</p>
                          <button type="button" className={diagnosticsStyles.reportActionRoot}>
                            <Icon name="play_circle" className={diagnosticsStyles.reportActionIcon} />
                            <div className={diagnosticsStyles.reportActionLabel}>Run</div>
                          </button>
                        </div>

                        <div className={util.formatClass(diagnosticsStyles.reportRoot, diagnosticsStyles.reportRootSuccess)}>
                          <Icon name="new_releases" className={diagnosticsStyles.reportIcon} />
                          <div className={diagnosticsStyles.reportTitle}>All tests passed long long long long long long long long long long long long long long</div>
                          <p className={diagnosticsStyles.reportDescription}>Ready to start long long long long long long long long long long long long long long long</p>
                          <button type="button" className={diagnosticsStyles.reportActionRoot}>
                            <Icon name="play_circle" className={diagnosticsStyles.reportActionIcon} />
                            <div className={diagnosticsStyles.reportActionLabel}>Run</div>
                          </button>
                        </div>
                      </div>
                    ) },
                  { id: 'parameters',
                    label: 'Parameters',
                    contents: () => (
                      <div className={util.formatClass(formStyles.main2, descriptionStyles.root)}>
                        <div className={descriptionStyles.header}>
                          <h2>Hamilton</h2>
                        </div>

                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>384 head tip type</div>
                          <div className={formStyles.fieldSelect}>
                            <select>
                              <option value="">Axygen</option>
                              <option value="">Hamilton</option>
                            </select>
                            <Icon name="expand_more" />
                          </div>
                        </label>

                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>Setup name</div>
                          <input type="text" placeholder="Enter name here" className={formStyles.fieldTextfield} />
                        </label>

                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>Setup name</div>
                          <textarea className={formStyles.fieldTextarea}></textarea>
                        </label>

                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>Setup name</div>
                          <input type="text" className={formStyles.fieldTextfield} />
                        </label>

                        <div className={formStyles.fieldGroup}>
                          <label className={formStyles.fieldControl}>
                            <div className={formStyles.fieldLabel}>Setup name</div>
                            <input type="text" className={formStyles.fieldTextfield} />
                          </label>
                          <label className={formStyles.fieldControl}>
                            <div className={formStyles.fieldLabel}>Setup name</div>
                            <input type="text" className={formStyles.fieldTextfield} />
                          </label>
                          <label className={formStyles.fieldControl}>
                            <div className={formStyles.fieldLabel}>Setup name</div>
                            <input type="text" className={formStyles.fieldTextfield} />
                          </label>
                        </div>

                        <div className={formStyles.fieldGroup}>
                          <label className={formStyles.fieldControl}>
                            <div className={formStyles.fieldLabel}>Setup name</div>
                            <input type="text" className={formStyles.fieldTextfield} />
                          </label>
                          <label className={formStyles.fieldControl}>
                            <div className={formStyles.fieldLabel}>Setup name</div>
                            <input type="text" className={formStyles.fieldTextfield} />
                          </label>
                        </div>

                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>Setup name</div>
                          <input type="text" className={formStyles.fieldTextfield} />
                        </label>

                        <h3>Something</h3>

                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>Setup name</div>
                          <input type="text" className={formStyles.fieldTextfield} />
                        </label>

                        <h2>Okolab settings long long long long long long long long long long</h2>

                        <h3>Something</h3>

                        <div className={descriptionStyles.header}>
                          <h2>Okolab settings long long long long long long long long long long</h2>
                        </div>

                        <div className={descriptionStyles.header}>
                          <h2>Okolab settings long long long long long long long long long long</h2>
                          <button type="button" className={formStyles.btn}>New</button>
                        </div>

                        <div className={descriptionStyles.header}>
                          <h2>Okolab settings</h2>
                        </div>

                        <p className={formStyles.paragraph}>Codespaces created from the following repositories can have GPG capabilities and sign commits so that GitHub can verify that they come from a trusted source. Only enable this for repositories that you trust.</p>

                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>Setup name</div>
                          <input type="text" className={formStyles.fieldTextfield} />
                        </label>
                        <label className={formStyles.fieldControl}>
                          <div className={formStyles.fieldLabel}>Setup name</div>
                          <input type="text" className={formStyles.fieldTextfield} />
                        </label>
                        <label className={formStyles.checkRoot}>
                          <input type="checkbox" />
                          <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                          <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
                        </label>
                        <label className={formStyles.checkRoot}>
                          <input type="checkbox" />
                          <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                          <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
                        </label>
                        <label className={formStyles.checkRoot}>
                          <input type="checkbox" />
                          <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                          <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
                        </label>
                        <label className={formStyles.checkRoot}>
                          <input type="checkbox" />
                          <div className={formStyles.checkTitle}>Organizations within this enterprise</div>
                          <p className={formStyles.checkDescription}>Members can fork a repository to an organization within this enterprise.</p>
                        </label>
                      </div>
                    )
                  },
                  { id: 'help',
                    label: 'Help',
                    contents: () => (
                      <div className={util.formatClass(formStyles.main2, descriptionStyles.root)}>
                        <div className={formStyles.header}>
                          <h2>Help</h2>
                        </div>

                        <p>The <code>actions</code> attribute groups a <a href="#">list of actions</a>.</p>
                        <p>Proin eget mauris vel nisl sagittis finibus. Quisque nisi ante, dignissim ut dolor sed, accumsan congue tortor. In in porta <code>libero</code>, sed pharetra nibh. Nunc eget risus sagittis, semper magna id, consequat orci. Nullam pharetra, nibh nec aliquam condimentum, elit ligula ullamcorper urna, faucibus tempor orci magna ut massa.</p>
                        <p>Proin eget mauris vel nisl <code>sagittis</code> finibus. Quisque nisi ante, dignissim ut dolor sed, accumsan congue tortor. In in porta <code>libero</code>, sed pharetra nibh. Nunc eget risus sagittis, semper magna id, consequat orci. Nullam pharetra, nibh nec aliquam condimentum, elit ligula ullamcorper urna, faucibus tempor orci magna ut massa.</p>
                        <p>Proin eget mauris vel nisl sagittis finibus. Quisque nisi ante, dignissim ut dolor sed, accumsan congue tortor. In in porta <code>libero</code>, sed pharetra nibh. Nunc eget risus sagittis, semper magna id, consequat orci. Nullam pharetra, nibh nec aliquam condimentum, elit ligula ullamcorper urna, faucibus tempor orci magna ut massa.</p>

                        <h3>Syntax</h3>
                        <p>Proin eget mauris vel nisl sagittis finibus. Quisque nisi ante, dignissim ut dolor sed, accumsan congue tortor. In in porta libero, sed pharetra nibh. Nunc eget risus sagittis, semper magna id, consequat orci. Nullam pharetra, nibh nec aliquam condimentum, elit ligula ullamcorper urna, faucibus tempor orci magna ut massa.</p>
                      </div>
                    ) },
                  { id: 'output',
                    label: 'Output' }
                ]} />
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

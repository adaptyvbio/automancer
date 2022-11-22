import * as React from 'react';
import Split from 'react-split-grid';

import { TabNav } from '../../components/tab-nav';
import { TitleBar } from '../../components/title-bar';
import * as util from '../../util';

import descriptionStyles from '../../../styles/components/description.module.scss';
import diagnosticsStyles from '../../../styles/components/diagnostics.module.scss';
import editorStyles from '../../../styles/components/editor.module.scss';
import formStyles from '../../../styles/components/form.module.scss';
import spotlightStyles from '../../../styles/components/spotlight.module.scss';
import viewStyles from '../../../styles/components/view.module.scss';
import { ContextMenuArea } from '../../components/context-menu-area';
import { Icon } from '../../components/icon';


export interface ViewSplit2Props {

}

export interface ViewSplit2State {
  dragging: number | null;
  inspector: boolean;
}

export class ViewSplit2 extends React.Component<ViewSplit2Props, ViewSplit2State> {
  refSplit = React.createRef<HTMLDivElement>();

  constructor(props: ViewSplit2Props) {
    super(props);

    this.state = {
      dragging: null,
      inspector: true
    };
  }

  getGridTemplate() {
    return this.refSplit.current!.computedStyleMap().get('grid-template-columns').toString().split(' ').map((item) => CSSNumericValue.parse(item));
  }

  setGridTemplate(template: CSSNumericValue[]) {
    this.refSplit.current!.style.setProperty('grid-template-columns', template.map((item) => item.toString()).join(' '));
  }

  updateInspector() {
    let gridTemplate = this.getGridTemplate();
    let inspector = gridTemplate[4].value > 1e-9;

    if (this.state.inspector !== inspector) {
      this.setState({ inspector });
    }
  }

  render() {
    return (
      <main className={viewStyles.root}>
        <TitleBar title="Split" tools={[{
          id: 'inspector',
          active: this.state.inspector,
          icon: 'view_week',
          onClick: () => {
            let inspector = !this.state.inspector;
            this.setState({ inspector });

            let gridTemplate = this.getGridTemplate();

            if (inspector) {
              gridTemplate[4] = CSSNumericValue.parse('300px');
            } else {
              gridTemplate[4] = CSSNumericValue.parse('0px');
            }

            this.setGridTemplate(gridTemplate);
          }
        }]} />

        <div className={util.formatClass(viewStyles.contents, editorStyles.root)}>
          <Split
            onDragStart={(direction, track) => {
              this.setState({ dragging: track });
            }}
            onDragEnd={() => {
              this.setState({ dragging: null });
              this.updateInspector();
            }}
            snapOffset={200}
            render={({
              getGridProps,
              getGutterProps,
            }) => (
              <div className={editorStyles.panels} {...getGridProps()} ref={this.refSplit}>
                <div><p>Panel 1</p></div>
                <div className={util.formatClass({ '_dragging': this.state.dragging === 1 })} {...getGutterProps('column', 1)} />
                <div><p>Panel 2</p></div>
                <div className={util.formatClass({ '_dragging': this.state.dragging === 3 })} {...getGutterProps('column', 3)} />
                <div><p>Panel 3</p></div>
              </div>
            )} />
        </div>
      </main>
    );
  }
}

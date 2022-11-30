import * as React from 'react';
import Split from 'react-split-grid';

import * as util from '../util';

import styles from '../../styles/components/split-panels.module.scss';


export interface Panel {
  component: React.ReactNode;
  nominalSize?: CSSNumericValue;
  onToggle?(open: boolean): void;
  open?: boolean;
}

export function SplitPanels(props: {
  className?: string;
  panels: Panel[];
}) {
  let [draggedTrack, setDraggedTrack] = React.useState<number | null>(null);
  let refContainer = React.useRef<HTMLDivElement>();

  let getGridTemplate = (value?: string) => {
    return (value ?? refContainer.current!.computedStyleMap().get('grid-template-columns').toString()).split(' ').map((item) => CSSNumericValue.parse(item));
  };

  let updateOpenPanels = () => {
    let gridTemplate = getGridTemplate();

    for (let [index, panel] of props.panels.entries()) {
      let open = gridTemplate[index * 2].value > 1e-9;

      if ((panel.open !== undefined) && (open !== panel.open)) {
        panel.onToggle?.(open);
      }
    }
  };

  return (
    <Split
      onDragStart={(_direction, track) => {
        setDraggedTrack(track);
      }}
      onDrag={() => {
        updateOpenPanels();
      }}
      onDragEnd={() => {
        setDraggedTrack(null);
      }}
      snapOffset={200}
      render={({
        getGridProps,
        getGutterProps,
      }) => (
        <div className={util.formatClass(styles.root, props.className)} {...(() => {
          let gridProps = getGridProps();

          let rawGridTemplate = gridProps.style.gridTemplateColumns;
          let gridTemplate = rawGridTemplate && getGridTemplate(rawGridTemplate);
          let newGridTemplate: CSSNumericValue[] | null = null;

          if (!gridTemplate) {
            newGridTemplate = new Array(props.panels.length * 2 - 1).fill(CSSNumericValue.parse('1px'));
          }

          for (let [index, panel] of props.panels.entries()) {
            if (!gridTemplate || (
              (panel.open !== undefined) && (panel.open !== (gridTemplate[index * 2].value > 1e-9))
            )) {
              let nominalSize = (panel.nominalSize ?? CSSNumericValue.parse('1fr'));

              if (!newGridTemplate) {
                newGridTemplate = gridTemplate.slice();
              }

              newGridTemplate![index * 2] = (panel.open !== false)
                ? nominalSize
                : CSSNumericValue.parse('0' + nominalSize.unit);
            }
          }

          return {
            ...gridProps,
            style: {
              ...gridProps.style,
              ...(newGridTemplate && { gridTemplateColumns: newGridTemplate.map((item) => item.toString()).join(' ') }),
            }
          };
        })()} ref={refContainer}>
          {props.panels.map((panel, index) => {
            let last = index === props.panels.length - 1;
            let gutterIndex = index * 2 + 1;

            return (
              <React.Fragment key={index}>
                {panel.component}
                {!last && (
                  <div className={util.formatClass({ '_dragging': draggedTrack === gutterIndex  })} {...getGutterProps('column', gutterIndex)} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )} />
  );
}

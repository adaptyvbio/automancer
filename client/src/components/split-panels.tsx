import * as React from 'react';
import Split from 'react-split-grid';

import * as util from '../util';


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
  let refPanels = React.useRef<Panel[]>();

  React.useEffect(() => {
    refPanels.current = props.panels;

    let gridTemplate = getGridTemplate();
    let updated = false;

    for (let [index, panel] of props.panels.entries()) {
      let open = gridTemplate[index * 2].value > 1e-9;

      if ((panel.open !== undefined) && (panel.open !== open)) {
        let nominalSize = (panel.nominalSize ?? CSSNumericValue.parse('1fr'));

        gridTemplate[index * 2] = panel.open
          ? nominalSize
          : CSSNumericValue.parse('0' + nominalSize.unit);
        updated = true;
      }
    }

    if (updated) {
      setGridTemplate(gridTemplate);
    }
  }, [props.panels]);

  let getGridTemplate = () => {
    return refContainer.current!.computedStyleMap().get('grid-template-columns').toString().split(' ').map((item) => CSSNumericValue.parse(item));
  };

  let setGridTemplate = (template: CSSNumericValue[]) => {
    refContainer.current!.style.setProperty('grid-template-columns', template.map((item) => item.toString()).join(' '));
  };

  // console.log('reading', props.panels[1].open);
  let updateOpenPanels = () => {
    // console.log('state', props.panels[1].open);

    let gridTemplate = getGridTemplate();

    for (let [index, panel] of refPanels.current!.entries()) {
      let open = gridTemplate[index * 2].value > 1e-9;
      // console.log(index, panel.open, '->', open)

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
        <div className={props.className} {...getGridProps()} ref={refContainer}>
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

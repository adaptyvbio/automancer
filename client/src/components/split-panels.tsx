import * as React from 'react';

import * as util from '../util';

import styles from '../../styles/components/split-panels.module.scss';


export interface Panel {
  component: React.ReactNode;
  nominalSize?: CSSNumericValue;
  onToggle?(open: boolean): void;
  open?: boolean;
}

export interface PanelInfo {
  fraction: number;
  open: boolean;
}

export function SplitPanels(props: {
  className?: string;
  panels: Panel[];
}) {
  // let [draggedTrack, setDraggedTrack] = React.useState<number | null>(null);
  let [drag, setDrag] = React.useState<{
    mousePosition: { x: number; y: number; }
    panelIndex: number;
  } | null>(null);
  let refContainer = React.useRef<HTMLDivElement>(null);

  let gutterWidth = 1;

  let [panelInfos, setPanelInfos] = React.useState<PanelInfo[]>(() =>
    props.panels.map((panel) =>
      panel.nominalSize
        ? {
          fraction: 0.5,
          open: true
        }
        : {
          fraction: 1,
          open: !('open' in panel) || panel.open!
        })
  );

  // let updatedPanelInfos = false;
  // let newPanelInfos = props.panels.map((panel, panelIndex) => {
  //   let info = panelInfos[panelIndex];

  //   if (panel.open && !info.open) {
  //     // Need to calculate size
  //   }

  //   if () {

  //   }
  // });

  // if (updatedPanelInfos) {
  //   setPanelInfos(newPanelInfos);
  //   return;
  // }

  let lastOpenPanelIndex = panelInfos.findLastIndex((info) => info.open);

  let template = props.panels.flatMap((panel, panelIndex) => {
    let info = panelInfos[panelIndex];
    let last = panelIndex === (props.panels.length - 1);
    let lastOpen = panelIndex === lastOpenPanelIndex;
    let panelTemplate = (info.open ? CSS.fr(info.fraction) : CSS.fr(0)).toString();

    return [
      panelTemplate,
      ...(!last ? [`${info.open && !lastOpen ? gutterWidth : 0}px`] : [])
    ];
  }).join(' ');

  // let calculate = () => {
  //   let rect = refContainer.current!.getBoundingClientRect();

  //   let totalGutterWidth = (props.panels.filter((panel) => panel.open).length - 1) * gutterWidth;
  //   let totalFraction = panelInfos.reduce((sum, info) => sum + (info.open ? info.fraction : 0), 0);

  //   let availableWidth = rect.width - totalGutterWidth;

  //   return panelInfos.map((info) => {
  //     return info.fraction / totalFraction * availableWidth;
  //   });
  // };

  return (
    <div
      className={util.formatClass(styles.root, props.className)}
      onMouseMove={(event) => {
        if (drag) {
          drag.updatePanelInfos(event.clientX);
        }
      }}
      onMouseUp={() => {
        if (drag) {
          setDrag(null);
        }
      }}
      onMouseLeave={() => {
        if (drag) {
          setDrag(null);
        }
      }}
      {...(() => {

      return {
        style: {
          // ...gridProps.style,
          // ...(newGridTemplate && { gridTemplateColumns: newGridTemplate.map((item) => item.toString()).join(' ') }),
          ...(drag && {
            cursor: 'col-resize',
            userSelect: 'none'
          }),
          gridTemplateColumns: template,
          // pointerEvents: 'none',
        }
      };
    })()} ref={refContainer}>
      {props.panels.map((dispPanel, dispPanelIndex) => {
        let last = dispPanelIndex === (props.panels.length - 1);

        return (
          <React.Fragment key={dispPanelIndex}>
            {dispPanel.component}
            {!last && (
              <div className={util.formatClass({ '_dragging': (dispPanelIndex === drag?.panelIndex)  })} onMouseDown={(event) => {
                let rect = refContainer.current!.getBoundingClientRect();

                let backwardsLeftPanelIndex = dispPanelIndex;
                let backwardsRightPanelIndex = dispPanelIndex + 1;

                let forwardsRightPanelIndex = props.panels.findIndex((panel, panelIndex) => (panelIndex > dispPanelIndex) && panelInfos[panelIndex].open);
                let forwardsLeftPanelIndex = forwardsRightPanelIndex - 1;

                // console.log(
                //   backwardsLeftPanelIndex,
                //   backwardsRightPanelIndex,
                //   forwardsLeftPanelIndex,
                //   forwardsRightPanelIndex
                // );

                let totalGutterWidth = (panelInfos.filter((panelInfo) => panelInfo.open).length - 1) * gutterWidth;
                let totalFraction = panelInfos.reduce((sum, info) => sum + (info.open ? info.fraction : 0), 0);

                let availableWidth = rect.width - totalGutterWidth;

                let backwardsLeftPanelX = 0;
                let backwardsRightPanelX = 0;
                let forwardsLeftPanelX = 0;
                let forwardsRightPanelX = 0;
                let originX = 0;

                for (let [panelIndex, panelInfo] of panelInfos.entries()) {
                  if (panelInfo.open) {
                    let size = panelInfo.fraction / totalFraction * availableWidth;

                    if (panelIndex < backwardsLeftPanelIndex) {
                      backwardsLeftPanelX += size + gutterWidth;
                    }

                    if (panelIndex <= backwardsRightPanelIndex) {
                      backwardsRightPanelX += size;
                    }

                    if (panelIndex < backwardsRightPanelIndex) {
                      backwardsRightPanelX += gutterWidth;
                    }

                    if (panelIndex < forwardsLeftPanelIndex) {
                      forwardsLeftPanelX += size + gutterWidth;
                    }

                    if (panelIndex <= forwardsRightPanelIndex) {
                      forwardsRightPanelX += size;
                    }

                    if (panelIndex < forwardsRightPanelIndex) {
                      forwardsRightPanelX += gutterWidth;
                    }

                    if (panelIndex <= dispPanelIndex) {
                      originX += size;
                    }

                    if (panelIndex < dispPanelIndex) {
                      originX += gutterWidth;
                    }
                  }
                }

                originX += gutterWidth / 2;

                // let originX = (backwardsRightPanelX + forwardsLeftPanelX) / 2;

                // console.log(x, originX);

                let backwardsTotalFraction = panelInfos[backwardsLeftPanelIndex].fraction + panelInfos[backwardsRightPanelIndex].fraction;
                let backwardsTotalWidth = backwardsRightPanelX - backwardsLeftPanelX;

                let forwardsTotalFraction = panelInfos[forwardsLeftPanelIndex].fraction + panelInfos[forwardsRightPanelIndex].fraction;
                let forwardsTotalWidth = forwardsRightPanelX - forwardsLeftPanelX;

                // console.log(rect.width, backwardsTotalWidth)
                // console.log(
                //   backwardsLeftPanelX,
                //   backwardsRightPanelX,
                //   forwardsLeftPanelX,
                //   forwardsRightPanelX
                // );

                let updatePanelInfos = (clientX: number) => {
                  let x = clientX - rect.x;

                  if (x < originX) {
                    let leftFraction = (x - backwardsLeftPanelX) / backwardsTotalWidth * backwardsTotalFraction;
                    let rightFraction = (backwardsRightPanelX - x) / backwardsTotalWidth * backwardsTotalFraction;

                    setPanelInfos([
                      ...panelInfos.slice(0, backwardsLeftPanelIndex),
                      {
                        fraction: leftFraction,
                        open: true
                      },
                      {
                        fraction: rightFraction,
                        open: true
                      },
                      ...panelInfos.slice(backwardsRightPanelIndex + 1)
                    ]);
                  }

                  if (x > originX) {
                    let leftFraction = (x - forwardsLeftPanelX) / forwardsTotalWidth * forwardsTotalFraction;
                    let rightFraction = (forwardsRightPanelX - x) / forwardsTotalWidth * forwardsTotalFraction;

                    // console.log(panelInfos)
                    // console.log(leftFraction, rightFraction);

                    setPanelInfos([
                      ...panelInfos.slice(0, forwardsLeftPanelIndex),
                      {
                        fraction: leftFraction,
                        open: true
                      },
                      {
                        fraction: rightFraction,
                        open: true
                      },
                      ...panelInfos.slice(forwardsRightPanelIndex + 1)
                    ]);
                  }
                };

                updatePanelInfos(event.clientX);

                setDrag({
                  originalPanelInfos: panelInfos,
                  panelIndex: dispPanelIndex,
                  updatePanelInfos
                });
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

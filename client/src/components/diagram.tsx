import * as React from 'react';

import { ControlNamespace } from '../backends/common';
import * as util from '../util';


export interface DiagramProps {
  sheet: ControlNamespace.Sheet;
  signal: bigint;
  targetValveIndex: number | null;
}

export class Diagram extends React.Component<DiagramProps> {
  ref = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this.update();
  }

  componentDidUpdate(prevProps: Readonly<DiagramProps>, prevState: Readonly<{}>) {
    this.update(prevProps.signal, prevProps.targetValveIndex);
  }

  update(prevSignal: bigint | null = null, prevTargetValveIndex: number | null = null) {
    let createTargetMask = (valveIndex: number | null) =>
      valveIndex !== null
        ? (1n << BigInt(valveIndex))
        : 0n;

    let diff = prevSignal !== null
      ? (this.props.signal ^ prevSignal) | (createTargetMask(this.props.targetValveIndex) ^ createTargetMask(prevTargetValveIndex))
      : (1n << BigInt(this.props.sheet.valves.length)) - 1n;

    for (let [valveIndex, valve] of this.props.sheet.valves.entries()) {
      let mask = 1n << BigInt(valveIndex);
      let changed = (diff & mask) > 0;

      if (changed && valve.diagramRef) {
        let value = ((this.props.signal & mask) > 0) !== valve.inverse;
        let element = this.ref.current!.querySelector(`[data-layer-index="${valve.diagramRef[0]}"][data-group-index="${valve.diagramRef[1]}"]`)!;

        element.classList.toggle('_active', value);
        element.classList.toggle('_target', valveIndex === this.props.targetValveIndex);
      }
    }
  }

  render() {
    // let filter = `
    // <filter id="demo4">
    //     <!--Blur effect-->
    //     <feGaussianBlur stdDeviation="3" result="blur4" />
    //     <!--Lighting effect-->
    //     <feSpecularLighting result="spec4" in="blur4" specularExponent="35" lighting-color="#cccccc">
    //         <!--Light source effect-->
    //         <fePointLight x="75" y="100" z="200">
    //           <!--Lighting Animation-->
    //           <animate attributeName="x" values="75;320;75" dur="10s" repeatCount="indefinite" />
    //         </fePointLight>
    //     </feSpecularLighting>
    //     <!--Composition of inputs-->
    //     <feComposite in="SourceGraphic" in2="spec4" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    //   </filter>
    //   <filter id="demo5">
    //     <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur5" />
    //     <!--Composition of inputs-->
    //     <feComposite in="SourceGraphic" in2="blur5" operator="arithmetic" k1="0" k2="3" k3="3" k4="0" />
    //   </filter>
    //   <filter id="demo6">
    //   <feColorMatrix type="matrix" values=
    //             "1 0 0 0   0
    //              0 0 0 0   0
    //              0 0 0 0   0
    //              0 0 0 0.7 0"/>
    // <feGaussianBlur stdDeviation="8.5" result="coloredBlur"/>
    // <feMerge>
    //     <feMergeNode in="coloredBlur"/>
    //     <feMergeNode in="SourceGraphic"/>
    // </feMerge>
    //   </filter>`;

    return (
      <div
        className={util.formatClass('diagram', { '_target': (this.props.targetValveIndex !== null) })}
        dangerouslySetInnerHTML={{ __html: this.props.sheet.diagram! }}
        // dangerouslySetInnerHTML={{ __html: this.props.sheet.diagram!.slice(0, -6) + filter + '</svg>' }}
        ref={this.ref} />
    );
  }
}

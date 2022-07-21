import * as React from 'react';

import { Model } from '../units/control';
import * as util from '../util';


export interface DiagramProps {
  model: Model;
  signal: bigint;
  targetChannelIndex: number | null;
}

export class Diagram extends React.Component<DiagramProps> {
  ref = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this.update();
  }

  componentDidUpdate(prevProps: Readonly<DiagramProps>, prevState: Readonly<{}>) {
    this.update(prevProps.signal, prevProps.targetChannelIndex);
  }

  update(prevSignal: bigint | null = null, prevTargetValveIndex: number | null = null) {
    let createTargetMask = (channelIndex: number | null) =>
      channelIndex !== null
        ? (1n << BigInt(channelIndex))
        : 0n;

    let diff = prevSignal !== null
      ? (this.props.signal ^ prevSignal) | (createTargetMask(this.props.targetChannelIndex) ^ createTargetMask(prevTargetValveIndex))
      : (1n << BigInt(this.props.model.channels.length)) - 1n;

    for (let [channelIndex, channel] of this.props.model.channels.entries()) {
      let mask = 1n << BigInt(channelIndex);
      let changed = (diff & mask) > 0;

      if (changed && channel.diagramRef) {
        let value = ((this.props.signal & mask) > 0) !== channel.inverse;
        let element = this.ref.current!.querySelector(`[data-layer-index="${channel.diagramRef[0]}"][data-group-index="${channel.diagramRef[1]}"]`)!;

        element.classList.toggle('_active', value);
        element.classList.toggle('_target', channelIndex === this.props.targetChannelIndex);
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
        className={util.formatClass('diagram', { '_target': (this.props.targetChannelIndex !== null) })}
        dangerouslySetInnerHTML={{ __html: this.props.model.diagram! }}
        ref={this.ref} />
    );
  }
}

import { React, util } from 'pr1';

import { Model } from '.';


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
    return (
      <div
        className={util.formatClass('mcontrol-diagram', { '_target': (this.props.targetChannelIndex !== null) })}
        dangerouslySetInnerHTML={{ __html: this.props.model.diagram! }}
        ref={this.ref} />
    );
  }
}

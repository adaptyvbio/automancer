import * as React from 'react';
import * as Rf from 'retroflex';

import type { Chip, ChipId, ChipModel, HostId } from '../backends/common';
import type { Host, Model } from '..';


// export default class ViewChipSettings extends React.Component<Rf.ViewProps<Model>, ViewChipSettingsState> {
export default function SelectChip(props: {
  hosts: Model['hosts'];
  onSelect(hostChipId: [HostId, ChipId]): void;
  selected: [HostId, ChipId] | null;
}) {
  return (
    <Rf.Select
      selectedOptionPath={props.selected}
      menu={
        Object.values(props.hosts).map((host) => {
          let chips = Object.values(host.state.chips);

          return {
            id: host.id,
            name: host.state.info.name,
            // disabled: Object.values(host.state.chips).length < 1,
            children: chips.length > 0
              ? Object.values(host.state.chips).map((chip) => ({
                id: chip.id,
                icon: 'memory',
                name: chip.name
              }))
              : [{ id: '_none', name: 'No chips defined', disabled: true }]
          };
        })
      }
      onSelect={([hostId, chipId]) => {
        props.onSelect([hostId, chipId]);
      }} />
  );
}

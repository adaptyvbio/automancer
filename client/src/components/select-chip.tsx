import * as React from 'react';
import * as Rf from 'retroflex';

import type { Chip, ChipId, ChipModel, HostId } from '../backends/common';
import type { Host, Model } from '..';


// export default class ViewChipSettings extends React.Component<Rf.ViewProps<Model>, ViewChipSettingsState> {
export default function SelectChip(props: {
  filterChip?(chip: Chip): unknown;
  hosts: Model['hosts'];
  onSelect(hostChipId: [HostId, ChipId]): void;
  selected: [HostId, ChipId] | null;
}) {
  let hosts = Object.values(props.hosts);

  return (
    <Rf.Select
      selectedOptionPath={props.selected}
      menu={[
        { id: '_header', name: 'Hosts', type: 'header' },
        ...(hosts.length > 0
          ? hosts.map((host) => {
            let chips = Object.values(host.state.chips);

            return {
              id: host.id,
              name: host.state.info.name,
              icon: 'storage',
              children: chips.length > 0
                ? Object.values(host.state.chips).map((chip) => ({
                  id: chip.id,
                  name: chip.name,
                  icon: 'memory',
                  disabled: props.filterChip && !props.filterChip(chip),
                }))
                : [{ id: '_none', name: 'No chips defined', disabled: true }]
            };
          })
          : [{ id: '_none', name: 'No hosts defined', disabled: true }])
      ]}
      onSelect={([hostId, chipId]) => {
        props.onSelect([hostId as HostId, chipId as ChipId]);
      }} />
  );
}

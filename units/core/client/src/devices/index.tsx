import { Plugin } from 'pr1';
import { ProtocolBlockName } from 'pr1-shared';

import applierBlock from './blocks/applier';
import publisherBlock from './blocks/publisher';
import { namespace } from './types';
import { DeviceControlView } from './view';


export default {
  namespace,
  blocks: {
    ['applier' as ProtocolBlockName]: applierBlock,
    ['publisher' as ProtocolBlockName]: publisherBlock
  },

  views: [{
    id: 'device-control',
    icon: 'tune',
    label: 'Device control',
    Component: DeviceControlView
  }]
} satisfies Plugin

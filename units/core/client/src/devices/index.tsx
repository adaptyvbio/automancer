import { Map as ImMap, List } from 'immutable';
import { Plugin } from 'pr1';
import { ProtocolBlockName } from 'pr1-shared';

import applierBlock from './blocks/applier';
import publisherBlock from './blocks/publisher';
import { PersistentStoreEntries, SessionStoreEntries, namespace } from './types';
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
  }],

  persistentStoreDefaults: {
    nodePrefs: ImMap(),
    userNodes: List()
  },
  sessionStoreDefaults: {
    selectedNodePath: null
  }
} satisfies Plugin<PersistentStoreEntries, SessionStoreEntries>

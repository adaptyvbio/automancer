import { React, TimedProgressBar, formatDynamicValue, DynamicValue, ProcessUnit, Plugin, createProcessBlockImpl } from 'pr1';
import { PluginName, ProtocolBlockName } from 'pr1-shared';


export interface ProcessData {
  duration: DynamicValue;
}

export interface ProcessLocation {
  duration: {
    quantity: DynamicValue;
    value: number;
  } | null;
  paused: boolean;
  progress: number;
}


export default {
  namespace: ('timer' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, ProcessLocation>({
      createFeatures(data, location) {
        return [{
          icon: 'hourglass_empty',
          label: (
            location
              ? (location.duration && formatDynamicValue(location.duration.quantity))
              : (!((data.duration.type === 'string') && (data.duration.value === 'forever')) ? formatDynamicValue(data.duration) : null)
          ) ?? 'Forever'
        }];
      },
      getLabel(data) {
        return 'Wait';
      },
    })
  }
} satisfies Plugin

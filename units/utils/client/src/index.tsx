import { Host, React, Unit } from 'pr1';


export interface ProcessData {
  type: 'run';
}

export interface ProcessLocation {
  pid: number;
}

export default {
  namespace: 'utils',

  ProcessComponent(props: {
    host: Host;
    processData: ProcessData;
    processLocation: ProcessLocation;
    time: number;
  }) {
    return (
      <div>PID: {props.processLocation.pid}</div>
    );
  },

  createProcessFeatures(processData: ProcessData, _options) {
    switch (processData.type) {
      case 'run': return [
        { icon: 'terminal',
          label: 'Run command' }
      ];
    }
  }
} satisfies Unit

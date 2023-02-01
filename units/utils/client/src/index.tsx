import { DynamicValue, formatDynamicValue, ProcessUnit, React } from 'pr1';


export interface ProcessData {
  type: 'run';
  command: DynamicValue;
}

export interface ProcessLocation {
  command: string;
  pid: number;
}

export default {
  namespace: 'utils',

  ProcessComponent(props) {
    return (
      <div>PID: {props.location.pid}</div>
    );
  },

  createProcessFeatures(data, location, context) {
    switch (data.type) {
      case 'run': return [
        { description: 'Run command',
          icon: 'terminal',
          label: location
            ? location.command
            : formatDynamicValue(data.command) }
      ];
    }
  },
  getProcessLabel(data, context) {
    return 'Run command';
  }
} satisfies ProcessUnit<ProcessData, ProcessLocation>

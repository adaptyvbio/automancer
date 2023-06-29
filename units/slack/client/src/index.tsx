import { DynamicValue, ExpandableText, Plugin, ProgressBar, createProcessBlockImpl, formatDynamicValue } from 'pr1';
import { PluginName, ProtocolBlockName } from 'pr1-shared';


export interface ProcessData {

}

export interface ProcessLocation {
  body: string;
  fileCount: number;
  phase: number;
}

export default {
  namespace: ('s3' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, ProcessLocation>({
      Component(props) {
        return <p>Progress: {props.location.phase}/{props.location.fileCount + 1}</p>
      },
      createFeatures(data, location) {
        return [
          { icon: 'chat',
            description: 'Slack message',
            label: location?.body ?? '...' }
        ];
      }
    })
  }
} satisfies Plugin

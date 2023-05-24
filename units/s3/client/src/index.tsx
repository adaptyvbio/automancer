import { DynamicValue, Host, Plugin, createProcessBlockImpl, formatDynamicValue } from 'pr1';
import { PluginName, ProtocolBlockName } from 'pr1-shared';


export interface ProcessData {
  bucket: DynamicValue;
  multipart: DynamicValue;
  target: DynamicValue;
}

export interface ProcessLocation {
  paused: boolean;
  phase: 'complete' | 'create' | 'done' | 'part_upload' | 'upload';
  progress: number;
}

export default {
  namespace: ('s3' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, never>({
      createFeatures(data, location) {
        return [
          { icon: 'cloud_upload',
            description: 'Upload to S3',
            label: <>Bucket {formatDynamicValue(data.bucket)}</> }
        ];
      }
    })
  }

  // ProcessComponent(props: {
  //   host: Host;
  //   processData: ProcessData;
  //   processLocation: ProcessLocation;
  //   time: number;
  // }) {
  //   let location = props.processLocation;

  //   let progress = (() => {
  //     switch (location.phase) {
  //       case 'complete': return 0.9;
  //       case 'create': return 0;
  //       case 'done': return 1;
  //       case 'part_upload': return 0.1 + location.progress * 0.8;
  //       case 'upload': return location.progress;
  //     }
  //   })();

  //   return (
  //     <div>
  //       <ProgressBar
  //         paused={props.processLocation.paused}
  //         value={progress} />
  //     </div>
  //   );
  // },

  // createProcessFeatures(processData: ProcessData, _options) {
  //   switch (processData.type) {
  //     case 'upload': return [
  //       { icon: 'cloud_upload',
  //         label: 'Upload to S3' }
  //     ];
  //   }
  // }
} satisfies Plugin

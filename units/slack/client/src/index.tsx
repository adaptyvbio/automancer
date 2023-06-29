import { DynamicValue, ExpandableText, Plugin, ProgressBar, createProcessBlockImpl, formatDynamicValue } from 'pr1';
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
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, ProcessLocation>({
      Component(props) {
        let progress = (() => {
          switch (props.location.phase) {
            case 'complete':
              return 0.9;
            case 'create':
              return 0;
            case 'done':
              return 1;
            case 'part_upload':
              return 0.1 + props.location.progress * 0.8;
            case 'upload':
              return props.location.progress;
          }
        })();

        return (
          <div>
            <ProgressBar
              description={() => (
                <ExpandableText expandedValue="100%">
                  {(progress * 100).toFixed() + '%'}
                </ExpandableText>
              )}
              paused={props.location.paused}
              value={progress} />
          </div>
        );
      },
      createFeatures(data, location) {
        return [
          { icon: 'cloud_upload',
            description: 'Upload to S3',
            label: <>Bucket {formatDynamicValue(data.bucket)}</> }
        ];
      }
    })
  }
} satisfies Plugin

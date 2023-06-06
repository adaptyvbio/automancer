import { EvaluableValue, Form, Plugin, ProgressDisplayMode, TimeSensitive, TimedProgressBar, createProcessBlockImpl, formatDuration, formatEvaluable } from 'pr1';
import { PluginName, ProtocolBlockName } from 'pr1-shared';


export interface ProcessData {
  duration: EvaluableValue<number | null>;
}

export interface ProcessLocation {
  duration: number | null;
  paused: boolean;
  progress: number;
  startDate: number;
}


export default {
  namespace: ('timer' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, ProcessLocation>({
      Component(props) {
        if (props.location.duration === null) {
          return (
            <TimeSensitive
              contents={() => (
                <p>Time elapsed: {new Date().toString()}</p>
              )}
              interval={1000} />
          );
        }

        return (
          <TimedProgressBar
            date={props.date}
            duration={props.location.duration * 1000}
            paused={props.location.paused}
            setValue={(progress) => {
              props.context.pool.add(async () => {
                await props.context.sendMessage({
                  type: 'jump',
                  value: {
                    progress
                  }
                });
              });
            }}
            value={props.location.progress} />
        );
      },
      createFeatures(data, location) {
        let formatInnerValue = (value: number | null) =>
          (value !== null)
            ? formatDuration(value * 1000)
            : 'Forever';

        return [{
          icon: 'hourglass_empty',
          label: location
            ? formatInnerValue(location.duration)
            : formatEvaluable(data.duration, formatInnerValue)
        }];
      },
      getLabel(data) {
        return 'Wait';
      }
    })
  },

  SettingsComponent(props) {
    let [shortcutPref, setShortcutPref] = props.context.store.usePersistent('progressDisplayMode');

    return (
      <>
        <h2>Timer</h2>

        <Form.Select
          label="Progress display mode"
          value={shortcutPref}
          onInput={setShortcutPref}
          options={[
            { id: ProgressDisplayMode.Fraction,
              label: 'Fraction' },
            { id: ProgressDisplayMode.TimeElapsed,
              label: 'Time elapsed' },
            { id: ProgressDisplayMode.TimeRemaining,
              label: 'Time remaining' }
          ]} />
      </>
    );
  },

  persistentStoreDefaults: {
    progressDisplayMode: ProgressDisplayMode.Fraction
  }
} satisfies Plugin<{
  progressDisplayMode: ProgressDisplayMode;
}>

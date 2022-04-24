import type { MasterEntry, Protocol } from './backends/common';
import * as util from './util';


declare global {
  interface Array<T> {
    at(index: number): T;
  }
}


export interface Analysis {
  current?: {
    segmentIndex: number;
  };
  done: {
    time: number;
  };
  segments: {
    timeRange: [number, number] | null;
  }[];
}

export function analyzeProtocol(protocol: Protocol, entries?: MasterEntry[]): Analysis {
  let analysisSegments: {
    timeRange: [number, number] | null;
  }[] = new Array(protocol.segments.length);

  let currentEntry = entries?.at(-1)!; // ! simplifies type tests
  let futureTime = 0;

  for (let [segmentIndex, segment] of protocol.segments.entries()) {
    if (entries && (segmentIndex < currentEntry.segmentIndex)) {
      let start = util.findLastEntry(entries, (entry) => entry.segmentIndex === segmentIndex);

      if (start) {
        let [endEntryIndex, endEntry] = start;
        let [startEntryIndex, startEntry] = util.findLastEntry(entries /* [optimization] .slice(0, endEntryIndex - 1) */, (entry, entryIndex) =>
          (entry.segmentIndex === segmentIndex) && (entries[entryIndex - 1]?.segmentIndex !== segmentIndex)
        )!;

        analysisSegments[segmentIndex] = {
          timeRange: [startEntry.time, endEntry.time]
        };

        // for (let entryIndex = endEntryIndex; entryIndex >= 0; entryIndex -= 1) {
        //   if ((entries[entryIndex].segmentIndex === segmentIndex) && (entries[entryIndex - 1].segmentIndex !== segmentIndex)) {
        //     startEntryIndex = segmentIndex;
        //     break;
        //   }
        // }
      } else {
        analysisSegments[segmentIndex] = { timeRange: null };
      }
    } else if (entries && (segmentIndex === currentEntry.segmentIndex)) {
      let timeLeft = segment.data.timer!.duration * 1000 * (1 - currentEntry.processState.progress);
      let [startEntryIndex, startEntry] = util.findLastEntry(entries, (entry, entryIndex) =>
        (entry.segmentIndex === segmentIndex) && (entries[entryIndex - 1]?.segmentIndex !== segmentIndex)
      )!;

      analysisSegments[segmentIndex] = {
        timeRange: [startEntry.time, currentEntry.time + timeLeft]
      };

      futureTime = currentEntry.time + timeLeft;
    } else {
      let duration = segment.data.timer!.duration * 1000;

      analysisSegments[segmentIndex] = {
        timeRange: [futureTime, futureTime + duration]
      };

      futureTime += duration;
    }
  }

  return {
    ...(entries && {
      current: { segmentIndex: currentEntry.segmentIndex }
    }),
    done: { time: futureTime },
    segments: analysisSegments
  };
}

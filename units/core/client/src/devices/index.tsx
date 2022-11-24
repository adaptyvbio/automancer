import { BlockState, CreateFeaturesOptions } from 'pr1';


export interface StateData {
  values: [string[], { magnitude: string; unit: string; }][];
}


const namespace = 'devices';

function createStateFeatures(stateData: BlockState, options: CreateFeaturesOptions) {
  let unitStateData = stateData[namespace] as StateData;

  return unitStateData.values.map(([path, { magnitude, unit }]) => {
    return {
      description: path.join('.'),
      icon: 'hourglass_empty',
      label: `${magnitude} ${unit}`
    };
  });
}


export default {
  createStateFeatures,
  namespace
}

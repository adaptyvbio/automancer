import * as uol from 'uol';


export const rootLogger = new uol.Logger({ levels: uol.StdLevels.Python }).init();

export type Logger = typeof rootLogger;

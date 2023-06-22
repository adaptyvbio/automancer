import { IPCEndpoint } from './preload';


declare global {
  interface Window {
    navigation: any;
    readonly api: IPCEndpoint;
  }
}

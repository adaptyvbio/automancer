import { IPCEndpoint } from './preload';


declare global {
  interface Window {
    readonly api: IPCEndpoint;
  }
}

import { createContext } from 'react';

import { ApplicationStore } from './application';
import { ContextMenuComponent } from './components/context-menu-area';


export const ApplicationStoreContext = createContext<ApplicationStore>(null as unknown as ApplicationStore);
export const ContextMenuContext = createContext<ContextMenuComponent | null>(null);

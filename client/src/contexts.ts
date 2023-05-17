import { createContext } from 'react';

import type { ContextMenuComponent } from './components/context-menu-area';
import type { StoreConsumer } from './store/types';
import type { ApplicationPersistentStoreEntries, ApplicationSessionStoreEntries } from './store/application';


export const ApplicationStoreContext = createContext<StoreConsumer<ApplicationPersistentStoreEntries, ApplicationSessionStoreEntries>>(null as any);
export const ContextMenuContext = createContext<ContextMenuComponent | null>(null);

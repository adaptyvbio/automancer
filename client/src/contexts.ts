import * as React from 'react';

import { ContextMenuComponent } from './components/context-menu-area';


export const ContextMenuContext = React.createContext<ContextMenuComponent | null>(null);

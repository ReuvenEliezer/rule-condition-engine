import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// One MSW server for the whole suite. Per-test overrides go through `server.use(...)`;
// `afterEach` in setup.ts resets them so tests stay isolated.
export const server = setupServer(...handlers);

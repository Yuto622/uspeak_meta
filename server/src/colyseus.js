// colyseus 0.15 ships a CommonJS main without an "exports" map, so Node's ESM loader
// cannot see its named exports. Re-export what we use from the default (module.exports).
import colyseus from 'colyseus';
import wsTransport from '@colyseus/ws-transport';

export const { Room, Server, ServerError, matchMaker } = colyseus;
export const { WebSocketTransport } = wsTransport;

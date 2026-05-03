import http from "node:http";

export interface NodeApiHostOptions<THub> {
  requestListener: http.RequestListener;
  createHub: (server: http.Server) => THub;
}

export interface NodeApiHost<THub> {
  server: http.Server;
  hub: THub;
  listen: (port: number, onListening?: () => void) => void;
}

export const createNodeApiHost = <THub>(options: NodeApiHostOptions<THub>): NodeApiHost<THub> => {
  const server = http.createServer(options.requestListener);
  const hub = options.createHub(server);

  return {
    server,
    hub,
    listen: (port, onListening) => {
      server.listen(port, onListening);
    },
  };
};
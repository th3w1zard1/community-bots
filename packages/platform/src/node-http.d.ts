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
export declare const createNodeApiHost: <THub>(options: NodeApiHostOptions<THub>) => NodeApiHost<THub>;

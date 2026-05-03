export declare const DEFAULT_LOCAL_WEB_PORTS: readonly [3000, 4173, 5173];
export interface BuildBrowserCorsAllowedOriginsOptions {
    discordAppId?: string;
    activityOrigin?: string | undefined;
    publicWebOrigin?: string | undefined;
    localPorts?: readonly (string | number)[] | undefined;
}
export interface CorsResolutionOptions {
    allowMethods?: string;
    allowHeaders?: string;
}
export interface CorsRequestLike {
    method: string;
    origin?: string | null | undefined;
}
export interface CorsResolution {
    headers: Record<string, string>;
    isPreflight: boolean;
}
export declare const buildLocalWebOrigins: (ports?: readonly (string | number)[]) => string[];
export declare const buildBrowserCorsAllowedOrigins: (options: BuildBrowserCorsAllowedOriginsOptions) => string[];
export declare const resolveCorsHeaders: (request: CorsRequestLike, allowedOrigins: readonly string[], options?: CorsResolutionOptions) => CorsResolution;

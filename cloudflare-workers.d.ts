// Sites supplies these bindings at runtime. The local workspace does not ship
// Cloudflare's worker type package, so keep a small ambient shim for `tsc`.
// Runtime code still validates each binding before using it.
declare module "cloudflare:workers" {
  export const env: Record<string, any> & { DB?: any };
}

type Fetcher = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
type D1Database = any;

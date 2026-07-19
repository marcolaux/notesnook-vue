/*
Compressor (renderer side) — forwards to the main-process node-zlib compressor
over the tRPC bridge. Implements `@notesnook/core`'s `ICompressor`
(base64 in/out). Ported from the desktop path of upstream
`apps/web/src/utils/compressor.ts`.
*/
import { desktop } from "./desktop-bridge";
import type { ICompressor } from "@notesnook-vue/contracts";

export class Compressor implements ICompressor {
  async compress(data: string): Promise<string> {
    return desktop.compress.gzip.mutate({ data, level: 6 });
  }

  async decompress(data: string): Promise<string> {
    return desktop.compress.gunzip.mutate({ data });
  }
}
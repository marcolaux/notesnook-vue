/**
 * Main-process compressor — gzip/gunzip via node `zlib`, base64 in/out.
 * Exposed over the tRPC bridge as `compress.gzip` / `compress.gunzip`.
 *
 * Ported from the desktop path of upstream `apps/web/src/utils/compressor.ts`,
 * which forwards to `desktop.compress` for `IS_DESKTOP_APP`.
 */
import { gzipSync, gunzipSync } from "node:zlib";
import { registerCompressorServer } from "../contracts/router";
import type { CompressorServer } from "../contracts/router";

export const compressorServer: CompressorServer = {
  async gzip(data, level = 6): Promise<string> {
    const buf = Buffer.from(data, "utf-8");
    return gzipSync(buf, { level }).toString("base64");
  },
  async gunzip(data): Promise<string> {
    const buf = Buffer.from(data, "base64");
    return gunzipSync(buf).toString("utf-8");
  }
};

export function registerCompressor(): void {
  registerCompressorServer(compressorServer);
}
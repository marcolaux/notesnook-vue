/**
 * Header-capable `EventSource` adapter over `@microsoft/fetch-event-source`.
 *
 * `@notesnook/core`'s SSE client (`api/index.ts:connectSSE`) opens an
 * `EventSource` to `${SSE_HOST}/sse` carrying a custom `Authorization: Bearer
 * <token>` header. The browser's *native* `EventSource` cannot send custom
 * headers, so unless `db.setup({ eventsource })` is given a header-capable
 * constructor, core's `connectSSE` returns early (`api/index.ts:385-392`) and
 * the SSE channel never opens — the server can never push `triggerSync`, so
 * cross-device auto-sync never fires. This adapter is that constructor.
 *
 * Mirrors the subset of the DOM `EventSource` interface core actually uses
 * (`api/index.ts:382-453` + `disconnectSSE` 369-376): the `onopen` / `onmessage`
 * / `onerror` handler properties (assigned after construction and nulled on
 * disconnect), `readyState`, the `OPEN` constant, and `close()`.
 *
 * `fetchEventSource` is functional (not a class) and starts the request
 * immediately on call, so its option callbacks read the handler properties
 * lazily at fire-time — by then core has assigned them synchronously after
 * `new EventSource(...)`, so they are in place before any network callback
 * can fire (the open/message/error callbacks all arrive asynchronously).
 *
 * Retry policy (the library gives full control — see its README): a *network*
 * error (connection cut mid-stream) retries with the library's 1000 ms backoff
 * by returning without throwing from `onerror`, mirroring native EventSource
 * auto-reconnect. A *fatal* HTTP status (auth/forbidden/not-found) throws to
 * stop, so a permanently-bad endpoint can't hammer the server. A *clean*
 * server-initiated close resolves (no reconnect) — core re-opens the channel
 * on the next `tokenRefreshed` / `userFetched` / `userLoggedIn`, so the link is
 * re-established without us retrying a possibly-stale session.
 *
 * Cast through `unknown` at the injection site (`database.ts`): the
 * `EventSourceConstructor` type core declares returns the DOM `EventSource`,
 * which this adapter intentionally implements only partially (core touches the
 * subset above), so a direct type match would require implementing all of
 * `EventTarget`. The runtime contract is what matters here.
 */
import { fetchEventSource } from "@microsoft/fetch-event-source";

/** DOM `EventSource` readyState constants. */
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

export class HeaderEventSource {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSED = CLOSED;
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSED = CLOSED;

  /** Assigned by core after construction; nulled on `disconnectSSE`. Read
   *  lazily by the fetch callbacks. Loosely typed (core assigns zero-arg /
   *  single-arg async handlers) so assignment from core's call sites is
   *  permissive. */
  onopen: ((...args: unknown[]) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  readonly url: string;
  readyState: number = CONNECTING;

  private controller: AbortController | null = null;

  constructor(uri: string, init: { headers?: Record<string, string> } = {}) {
    this.url = uri;
    this.connect(init.headers ?? {});
  }

  private connect(headers: Record<string, string>): void {
    const controller = new AbortController();
    this.controller = controller;
    this.readyState = CONNECTING;

    void fetchEventSource(this.url, {
      method: "GET",
      headers: { ...headers },
      signal: controller.signal,
      // Validate the response: a non-OK status is fatal (auth/forbidden) —
      // throw to stop the loop instead of treating it as an open stream.
      onopen: async (response) => {
        if (!response.ok) {
          this.readyState = CLOSED;
          throw new Error(`SSE HTTP ${response.status}`);
        }
        this.readyState = OPEN;
        try {
          this.onopen?.();
        } catch {
          /* ignore handler error */
        }
      },
      onmessage: (msg) => {
        try {
          this.onmessage?.({ data: msg.data });
        } catch {
          /* ignore handler error */
        }
      },
      onerror: (err) => {
        try {
          this.onerror?.(err);
        } catch {
          /* ignore handler error */
        }
        // Aborted by us (close()) → the library skips onerror entirely via
        // its own `signal.aborted` guard, so this branch is belt-and-suspenders.
        if (this.readyState === CLOSED || controller.signal.aborted) {
          throw err; // stop retrying
        }
        // Transient network error → retry with the library's backoff
        // (mirrors native EventSource auto-reconnect). Reflect the reconnect
        // attempt in readyState.
        this.readyState = CONNECTING;
        // Returning without throwing → the library schedules a retry.
      },
      onclose: () => {
        // Clean server-initiated close → stop (don't reconnect on a possibly-
        // stale session; core re-opens on the next token/user event).
        this.readyState = CLOSED;
      }
    }).catch(() => {
      // Swallow: errors are surfaced via onerror; a rejection here just means
      // the stream ended fatally or was aborted.
    });
  }

  close(): void {
    this.readyState = CLOSED;
    this.controller?.abort();
    this.controller = null;
  }
}
/*
NNCrypto — the sodium-backed crypto implementation used by `NNStorage`.
Ported from the sync path of upstream `apps/web/src/interfaces/nncrypto.ts`
(GPL-3.0). Upstream prefers a comlink worker (`wrap<INNCrypto>(new
CryptoWorker())`) but notes `pull failed` errors; it falls back to the sync
`NNCrypto` class. We use the sync class directly for simplicity — it lazy-inits
`@notesnook/sodium` on first use, and sodium's browser build is already bundled
into the renderer via `@notesnook/core`. The worker variant can be revisited if
crypto blocks the UI thread measurably.
*/
import { NNCrypto as NNCryptoSync } from "@notesnook/crypto";
import type { INNCrypto } from "@notesnook/crypto";

export const NNCrypto: INNCrypto = new NNCryptoSync();
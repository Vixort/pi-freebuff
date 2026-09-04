# Plan: Anti-Ban & Stealth Protection Architecture for pi-freebuff

## Context
When utilizing the Freebuff/Codebuff backend, accounts can be flagged or suspended (`403 {"status":"banned"}`) if upstream anti-abuse heuristics detect irregular patterns, such as:
1. Rapid, burst requests with zero delay (bot-like scraping behavior).
2. Repeatedly exhausting daily rate-limits (`429 rate_limited`), which triggers spam flags.
3. Abandoned, lingering cloud sessions causing `409 session_superseded`.
4. Rapid token hopping across multiple accounts from the exact same IP address.

The goal is to implement a **5-Layer Anti-Ban Shield** directly inside `index.ts` so that interactions via `pi CLI` closely emulate official Freebuff CLI and human developer usage.

---

## Approach (5-Layer Defense Shield)

### 1. Proactive Quota Guard
- Upstream returns quota metrics (`recentCount` and `limit`) in every session handshake.
- **Mechanism:** When the active account reaches 90% of its daily quota (`recentCount >= limit - 0.5`), the adapter proactively rotates to a standby account in the pool *before* encountering a 429 Rate Limit error.

### 2. Humanized Jitter & Request Pacing
- Back-to-back tool execution turns firing within 10ms can trigger WAF alarms.
- **Mechanism:** The `RequestPacer` injects randomized 250ms–550ms micro-delays between rapid burst turns, mimicking realistic human reading and typing pauses.

### 3. Graceful Session Lifecycle Teardown
- When `pi CLI` shuts down (`session_shutdown`) or when switching accounts:
- **Mechanism:** Sends `DELETE /api/v1/freebuff/session` to release the cloud session slot, preventing orphaned sessions and avoiding `409 session_superseded` on the next run.

### 4. Circuit Breaker & Progressive Cooldown
- If an account encounters rate limits (`429`) or waiting room queues:
- **Mechanism:** Automatically suspends that token with a 60-minute cooldown and immediately fails over to the next healthy token in the pool, avoiding aggressive retries on exhausted accounts.

### 5. Upstream HTTP / WARP Proxy Support
- Supports `FREEBUFF_HTTP_PROXY`, `HTTP_PROXY`, and `HTTPS_PROXY`.
- **Mechanism:** Outbound calls to `codebuff.com` route through Node's `undici.ProxyAgent` when a proxy is configured, allowing users to route through Cloudflare WARP or residential proxies.

---

## Files Modified
- `index.ts`: Proactive quota guard, pacer, sticky token pool, session teardown, proxy dispatcher.
- `manage.js`: Cross-platform interactive TUI manager (100% English).
- `manage.sh` / `manage.cmd` / `manage.ps1`: Shell and batch wrappers.
- `README.md`: English documentation, architecture diagrams, and banner.

---

## Reuse
- Node.js native standard library: `node:http`, `node:https`, `node:fs`, `node:path`, `node:os`, `undici.ProxyAgent`.
- Vercel AI SDK request signatures and official Freebuff CLI credentials format.

---

## Verification
1. Offline unit verification: Validated that `ProactiveQuotaGuard` rotates before rate-limit thresholds.
2. Verified that `RequestPacer` inserts natural 250ms–550ms micro-delays between rapid calls.
3. Verified clean session release (`DELETE`) on process exit.

<div align="center">

<img src="assets/banner.png" alt="pi-freebuff banner" width="100%" />

# pi-freebuff

**High-performance, zero-Docker embedded provider bridge connecting Freebuff (Codebuff) AI models directly into the pi coding agent CLI — with native tool calling, freebucks coin awareness, and enterprise-grade stealth protection.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS-informational)](#cross-platform-manager)
[![Runtime](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen)](#)
[![pi CLI](https://img.shields.io/badge/pi%20CLI-Compatible-purple)](https://github.com/earendil-works/pi-coding-agent)
[![Release](https://img.shields.io/badge/Release-v1.1.0-success)](#)

[Features](#-key-features) • [Architecture](#-architecture--logic) • [Quick Start](#-quick-start) • [Coin System](#-freebucks-coin-system) • [Anti-Ban Shield](#-5-layer-anti-ban--stealth-shield) • [Configuration](#-configuration)

</div>

---

## 🚀 Key Features

- **Zero-Docker, Zero-Daemon** — Runs as an ultra-lightweight, in-process adapter inside `pi CLI`. Starts instantly, listens on an ephemeral localhost port, and shuts down cleanly with your session. No Go binaries, no containers, no port collisions.
- **Native Tool Calling (DSML Stream Parser)** — DeepSeek-family models on Freebuff emit tool invocations as DSML/XML tokens. A real-time streaming parser converts them into standard OpenAI `tool_calls`, so `pi` can run `bash`, `read`, `write`, and `edit` locally as if the model spoke Function Calling natively.
- **Freebucks Coin Awareness** — Reads your account's coin balance, daily allowance, and per-model price table from every session handshake, then rotates accounts *before* coins run out (see [Proactive Credit Guard](#-5-layer-anti-ban--stealth-shield)).
- **Sticky Multi-Account Pool** — Rotate multiple Freebuff accounts smoothly. A human-like "sticky" strategy keeps one account for up to 1 hour or 25 requests, eliminating suspicious IP-to-token flapping.
- **Session Heartbeat Keep-Alive** — Mimics the official desktop client's 45-second heartbeat so sessions don't expire mid-conversation during long reading/thinking pauses.
- **Auto-Discovery & Zero-Config** — Instantly discovers credentials from `~/.config/manicode/credentials.json` (created by the official Freebuff CLI). No copy-pasting required.
- **Self-Updating Model Catalog** — Syncs the model list from three sources: your account's `freebucks.prices` table, per-model quotas, and the upstream `free-agents.ts` catalog. Brand-new models appear automatically without touching the plugin.
- **Interactive Cross-Platform TUI Manager** — Manage accounts, update, troubleshoot, and verify models on Linux, Windows, and macOS via `./manage.sh` or `manage.cmd`.

## 🏛 Architecture & Logic

Traditional third-party proxies require separate Go binaries or bulky Docker containers exposing open listening ports. **pi-freebuff** uses an in-process adapter pattern instead:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                 pi CLI                                  │
│                                                                         │
│   ┌─────────────────────┐               ┌───────────────────────────┐   │
│   │   pi Agent Core     │               │  Embedded Native Adapter  │   │
│   │ (OpenAI-compatible) │ ──(HTTP req)─►│ (127.0.0.1:ephemeral_port)│   │
│   └─────────────────────┘               └─────────────┬─────────────┘   │
└───────────────────────────────────────────────────────┼─────────────────┘
                                                        │ HTTPS (TLS)
                                                        │ Vercel AI SDK Spec
                                                        ▼
                                       ┌──────────────────────────────────┐
                                       │   https://www.codebuff.com       │
                                       │    - Freebuff Session (45s HB)   │
                                       │    - Agent Run Lifecycle         │
                                       │    - Streaming Completions       │
                                       └──────────────────────────────────┘
```

### Request & Tool-Execution Lifecycle

When you prompt `pi`, the adapter manages the proprietary Codebuff handshake behind the scenes:

```
User Prompt
    │
    ▼
[pi CLI Engine]
    │  Injects local tools & system prompt
    ▼
[Embedded Adapter]
    │  1. Ensures/refreshes the active Waiting Room session
    │  2. Starts an upstream Agent Run (`/api/v1/agent-runs`)
    │  3. Strips unsupported top-level fields (prevents 404/400 rejections)
    │  4. Injects CLI stealth metadata & the "You are Buffy" marker
    │  5. Checks freebucks: rotates account early if coins can't cover the model
    ▼
[codebuff.com Upstream]
    │  Model generates reasoning & a DSML tool call:
    │  `<｜DSML｜tool_calls><｜DSML｜invoke name="bash">...`
    ▼
[Streaming DSML Parser]
    │  Intercepts `<｜DSML｜...>` tokens in SSE chunks in real time
    │  Translates DSML into standard OpenAI `delta.tool_calls`
    ▼
[pi CLI Executes Tool]
    │  Runs local bash / file edits, captures stdout
    ▼
[Next Turn with Tool Result]
    │  Tool result (`role: "tool"`) streamed back upstream
    ▼
[Final Assistant Response Displayed]
```

## 🪙 Freebucks Coin System

Freebuff runs on **freebucks coins** rather than a simple request quota:

- Each account receives a **daily coin allowance** plus a persistent **balance**.
- Every model has a **coin price** per request (e.g. `upstage/solar-pro4` costs 0; premium models cost more).
- The session handshake (`POST /api/v1/freebuff/session`) returns:
  - `freebucks.balance` — spendable coins
  - `freebucks.daily.{limit, spent, remaining, resetAt}` — daily allowance (resets midnight Pacific)
  - `freebucks.prices` — per-model price table
  - `freebucks.peak` — temporary peak-pricing surcharges (e.g. +15 on DeepSeek during peak hours)
- `pi-freebuff` uses these fields to display your live balance in `/freebuff` and to **rotate accounts before coins run out** (Proactive Credit Guard).
- The 45s heartbeat refreshes your balance and session expiry in the background, so `/freebuff` always shows fresh numbers.

> Note: your exact wallet balance via the web protocol requires a web Cookie; the embedded adapter reads whatever the Bearer-token session handshake exposes.

## 🛡️ 5-Layer Anti-Ban & Stealth Shield

Freebuff monitors traffic for scraper-like behavior. pi-freebuff ships a layered defense designed to keep your tokens safe:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         5-LAYER DEFENSE SHIELD                          │
├─────────────────────────────────────────────────────────────────────────┤
│ [1] Proactive Credit Guard  ► Rotates account before freebucks run out  │
│ [2] Humanized Jitter/Pacer  ► 250ms - 550ms micro-delays on rapid bursts│
│ [3] Sticky Session Affinity ► 1 hour / 25 reqs per token (No IP hopping)│
│ [4] Clean Cloud Teardown    ► Sends DELETE /session on exit (No ghosts) │
│ [5] Upstream Proxy Routing  ► Supports Cloudflare WARP & HTTP proxies   │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Proactive Credit Guard** — Every handshake exposes the coin balance and per-model prices. When the active account can no longer afford the requested model, the adapter switches to a healthy standby *before* hitting a rate-limit error that could flag the account. Insufficient-credit errors trigger a 60-minute cooldown and instant failover. Legacy per-model quotas are honored as a fallback.
2. **Humanized Jitter & Pacing** — Rapid tool loops that fire within 10ms are a red flag for WAFs. The built-in `RequestPacer` injects randomized 250–550ms micro-delays between burst turns, mimicking human reading/typing pauses.
3. **Sticky Token Rotation** — Accounts stay bound for up to 1 hour or 25 requests before gently handing off, avoiding suspicious IP-to-account correlation.
4. **Session Lifecycle Teardown** — On shutdown, every active cloud session is released (`DELETE /api/v1/freebuff/session` with the instance ID), preventing orphaned sessions and `409 session_superseded` on the next run.
5. **Proxy Support** — Route all upstream traffic through a proxy (Cloudflare WARP, residential proxies, etc.) via `FREEBUFF_HTTP_PROXY`.

## 📦 Quick Start

### 1. Install the extension in pi CLI

```bash
pi install git:github.com/Vixort/pi-freebuff
```

*(Or test locally without installing: `pi -e ./index.ts`)*

### 2. Acquire your auth token

Pick either option:

- **Option A (Web — recommended):** Visit [https://freebuff.llm.pm](https://freebuff.llm.pm), log in, and copy your `authToken`.
- **Option B (Freebuff CLI):** Run `npm i -g freebuff && freebuff`. Log in once — credentials are saved to `~/.config/manicode/credentials.json` and detected automatically.

### 3. Add the token and run

Inside `pi CLI`:

```text
/freebuff add <YOUR_TOKEN>
```

Or via the interactive manager:

```bash
./manage.sh <YOUR_TOKEN>
```

Start coding with Freebuff models:

```bash
pi --model freebuff/deepseek/deepseek-v4-flash
```

> 💡 Add **two or more tokens** (`/freebuff add` again) so the credit guard can rotate accounts automatically when one runs low on coins.

## 🎮 TUI Manager & CLI

`pi-freebuff` ships a cross-platform TUI manager (`manage.sh` on Unix, `manage.cmd` / `manage.ps1` on Windows, or `npm run manage`):

```text
╔════════════════════════════════════════════════════════════╗
║              pi-freebuff Manager & Updater                 ║
╚════════════════════════════════════════════════════════════╝
 Platform: linux (x64)  |  Config: ~/.config/manicode/credentials.json

  [1] Full Auto Update (Git Pull + Verify with pi)
  [2] Pull Latest Code (git pull)
  [3] View Token Pool Status
  [4] Add New Token to Pool
  [5] Set / Replace Primary Token
  [6] Verify & List Models in pi CLI
  [7] Clear / Reset Stale Cloud Sessions (Fix 409 errors)
  [8] Help & Troubleshooting
  [9] Uninstall / Remove pi-freebuff from pi CLI
  [10] Exit
```

### Command-line shortcuts

```bash
./manage.sh list          # View all configured accounts & masked tokens
./manage.sh add <TOKEN>   # Add another token to the pool
./manage.sh reset         # Clear lingering cloud sessions (fixes 409 errors)
./manage.sh help          # Troubleshooting guide & server ping test
./manage.sh uninstall     # Cleanly uninstall from pi CLI settings
```

## 💬 In-Session Commands (`/freebuff`)

Manage your connection without leaving the pi TUI:

| Command | Action |
|---|---|
| `/freebuff` | Interactive menu: status, add token, rotate, switch model |
| `/freebuff login` | Shows the login link (`https://freebuff.llm.pm`) and prompts for the token |
| `/freebuff add <TOKEN>` | Adds a token to the pool immediately (and saves it) |
| `/freebuff rotate` | Force-switch to the next standby account |
| `/model` | Native pi model selector (under the **Freebuff (Native)** group) |

The status view shows the active account, per-account request counts, freebucks balance/daily allowance, the active model & instance, and a ⚠ warning if the account's region is flagged (`country_not_allowed`).

## ⚙️ Configuration

Optional environment variables:

| Variable | Description | Default |
|---|---|---|
| `FREEBUFF_AUTH_TOKEN` | Primary auth token (overrides the credentials file) | `~/.config/manicode/credentials.json` |
| `FREEBUFF_AUTH_TOKENS` | Comma-separated list of tokens for the pool | None |
| `FREEBUFF_HTTP_PROXY` | HTTP/HTTPS proxy for upstream requests (e.g. `http://127.0.0.1:7890`) | Direct connection |
| `DEBUG_FREEBUFF` | Verbose payload & tool-call debugging | `false` |

## 🗺️ Supported Models

Coin prices below were observed from a live handshake (they can change; peak pricing adds temporary surcharges). The catalog syncs automatically from `freebucks.prices` + the upstream `free-agents.ts` source, so new models appear without updating the plugin.

| Model ID | Display Name | Freebucks | Context |
|---|---|:---:|:---:|
| `upstage/solar-pro4` | Solar Pro 4 | 0 | 128K |
| `z-ai/glm-5.3-flash` | GLM 5.3 Flash | 5 | 128K |
| `crof/kimi-k3-eco` | Kimi K3 Eco | 5 | 128K |
| `mimo/mimo-v2.5` | MiMo 2.5 | 10 | 128K |
| `meta/muse-spark-1.2-contributor` | Muse Spark 1.2 | 15 | 128K |
| `meta/muse-spark-1.3-contributor` | Muse Spark 1.3 | 15 | 128K |
| `openai/gpt-5.6-luna` | GPT-5.6 Luna | 20 | 128K |
| `openai/gpt-5.6-luna-es` | GPT-5.6 Luna ES | 20 | 128K |
| `deepseek/deepseek-v4-flash` | DeepSeek V4 Flash | 30 (peak +15) | 128K |
| `google/gemini-3.8-flash` | Gemini 3.8 Flash | 50 | 128K |
| `deepseek/deepseek-v4-flash-0731` | DeepSeek V4 Flash 07/31 | alias | 128K |
| `deepseek/deepseek-v4-flash-max` | DeepSeek V4 Flash Max | dynamic | 128K |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | dynamic | 128K |
| `deepseek/deepseek-v4-pro-max` | DeepSeek V4 Pro Max | dynamic | 128K |
| `google/gemini-3.5-flash-lite` | Gemini 3.5 Flash Lite | dynamic | 128K |
| `google/gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite | dynamic | 128K |
| `openai/gpt-5.6-luna-max` | GPT-5.6 Luna Max | dynamic | 128K |
| `anthropic/claude-fable-5` | Claude Fable 5 | dynamic | 128K |
| `stealth/ox-alpha` | Ox Alpha | dynamic | 128K |

*"dynamic" = price not yet observed in a live handshake; "alias" = alternate ID of the same model.*

## 🔬 Protocol Verification

The adapter's protocol was validated against the live upstream (September 2026) with real accounts:

- ✅ Session handshake returns `freebucks.{balance, daily, prices, peak}` and per-model quotas
- ✅ End-to-end chat on a 0-coin model (`upstage/solar-pro4`) returns `200 OK`
- ✅ `DELETE` teardown returns `200` for every session — no ghost sessions
- ⚠️ The `x-freebuff-multi-session` header marks your session as a secondary instance and triggers `409 session_superseded` — pi-freebuff deliberately does **not** send it
- ⚠️ Limited-tier accounts may report `country_not_allowed` while still working

A safe test harness is included (`scripts/protocol-test.mjs`) — it masks tokens, paces requests like a human, and always releases sessions.

## 🤝 Contributing & License

Contributions, bug reports, and feature requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request to the `dev` branch

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

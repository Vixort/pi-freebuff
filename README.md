<div align="center">

<img src="assets/banner.png" alt="pi-freebuff banner" width="100%" />

# pi-freebuff

**High-performance, Zero-Docker embedded provider bridge connecting Freebuff (Codebuff) AI models directly into pi coding agent CLI with native tool calling and enterprise-grade stealth protection.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS-informational)](#cross-platform-manager)
[![Runtime](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen)](#)
[![pi CLI](https://img.shields.io/badge/pi%20CLI-Compatible-purple)](https://github.com/earendil-works/pi-coding-agent)

[Features](#-key-features) • [Architecture](#-architecture--logic) • [Quick Start](#-quick-start) • [Anti-Ban Shield](#-5-layer-anti-ban--stealth-shield) • [TUI Manager](#-tui-manager--cli) • [Documentation](#-configuration)

</div>

---

## 🚀 Key Features

- **Zero-Docker & Zero-Daemon:** Runs as an ultra-lightweight, in-process ephemeral adapter inside `pi CLI`. Starts instantly and shuts down cleanly with your session. No background daemons, no Go runtime, and no port collisions.
- **Native Tool Calling (DSML Stream Parser):** DeepSeek models on Freebuff emit tool invocations in native DSML/XML format. Our real-time streaming parser transparently converts DSML into standard OpenAI Function Calling, allowing `pi` to execute `bash`, `read`, `write`, and `edit` in your local environment.
- **Sticky Multi-Account Pool:** Rotate multiple Freebuff accounts smoothly. Uses a human-like "sticky" strategy (maintains the same account for 1 hour or 25 requests) to eliminate suspicious IP-to-token flapping.
- **Auto-Discovery & Zero-Config:** Instantly discovers your existing credentials from `~/.config/manicode/credentials.json` (created by the official Freebuff CLI). Zero manual copy-pasting required.
- **Dynamic Model Catalog:** Syncs models directly from Codebuff — the account's `freebucks.prices` table, per-model quotas, and the upstream `free-agents.ts` catalog — so brand-new models (Gemini 3.8, GPT-5.6 Luna, Kimi K3 Eco, Muse Spark, etc.) appear automatically without touching the plugin.
- **Interactive Cross-Platform TUI Manager:** Manage accounts, auto-update, troubleshoot cloud sessions, and verify models across Linux, Windows, and macOS with `./manage.sh` or `manage.cmd`.

---

## 🏛 Architecture & Logic

Traditional third-party proxies require compiling separate Go binaries or running bulky Docker containers that expose open listening ports. **`pi-freebuff`** adopts an in-process adapter pattern:

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
                                       │    - Waiting Room Session        │
                                       │    - Agent Run Lifecycle         │
                                       │    - Streaming Completions       │
                                       └──────────────────────────────────┘
```

### Request & Tool-Execution Lifecycle

When you prompt `pi`, the adapter manages the proprietary Codebuff handshake seamlessly behind the scenes:

```
User Prompt
    │
    ▼
[pi CLI Engine]
    │  Injects local tools & system prompt
    ▼
[Embedded Adapter]
    │  1. Attaches or refreshes active Waiting Room session
    │  2. Starts upstream Agent Run (`/api/v1/agent-runs`)
    │  3. Strips unsupported top-level fields (prevents 404/400 rejections)
    │  4. Injects CLI stealth metadata & "You are Buffy" marker
    ▼
[codebuff.com Upstream]
    │  DeepSeek generates reasoning & DSML tool call:
    │  `<｜DSML｜tool_calls><｜DSML｜invoke name="bash">...`
    ▼
[Streaming DSML Parser]
    │  Intercepts `<｜DSML｜...>` tokens in SSE chunks in real-time
    │  Translates DSML into standard OpenAI `delta.tool_calls`
    ▼
[pi CLI Executes Tool]
    │  Runs local bash / file edit, captures stdout
    ▼
[Next Turn with Tool Result]
    │  Tool result (`role: "tool"`) streamed back upstream
    ▼
[Final Assistant Response Displayed]
```

---

## 🛡️ 5-Layer Anti-Ban & Stealth Shield

Freebuff monitors incoming traffic for abnormal scraper/bot behavior. `pi-freebuff` includes a comprehensive defense system engineered to keep your tokens safe:

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

1. **Proactive Credit Guard:** Freebuff uses a **freebucks coin system** (the legacy daily quota system was retired). Every session handshake returns your coin balance (`freebucks.balance`), daily allowance (`freebucks.daily`), and a per-model price table (`freebucks.prices`). When an account can no longer afford a model's coin price, the adapter smoothly switches to a standby account *before* hitting a rate-limit error that could flag the account.
2. **Humanized Jitter & Pacing:** Rapid tool execution loops (which can fire within 10ms) are a major red flag for WAFs. The built-in `RequestPacer` injects randomized 250ms–550ms micro-delays between burst turns, mimicking realistic human reading/typing pauses.
3. **Sticky Token Rotation:** Rather than rotating accounts per request (which causes suspicious IP-to-account correlation), accounts stay bound for up to 1 hour or 25 requests before gently handing off to the next account.
4. **Session Lifecycle Teardown:** Whenever `pi` shuts down, `pi-freebuff` automatically releases all active cloud sessions (`DELETE /api/v1/freebuff/session`). This prevents abandoned sessions that trigger `409 session_superseded`.
5. **Proxy Support:** Route all upstream traffic through a proxy (e.g., Cloudflare WARP or residential proxies) via `FREEBUFF_HTTP_PROXY`.

---

## 📦 Quick Start

### 1. Install Extension in pi CLI

Install directly from GitHub using `pi` package manager:

```bash
pi install git:github.com/Vixort/pi-freebuff
```

*(Or test locally without installing: `pi -e ./index.ts`)*

### 2. Acquire Your Auth Token

Choose either option:

- **Option A (Web - Recommended):**
  Visit **[https://freebuff.llm.pm](https://freebuff.llm.pm)**, log in, and copy your `authToken`.
- **Option B (Freebuff CLI):**
  Run `npm i -g freebuff && freebuff`. Log in once—your credentials are saved to `~/.config/manicode/credentials.json` and automatically detected by `pi-freebuff`.

### 3. Add Token & Run

Add your token inside `pi CLI` directly:
```text
/freebuff add <YOUR_TOKEN>
```
Or via the interactive manager script:
```bash
./manage.sh <YOUR_TOKEN>
```

Start coding with Freebuff models:
```bash
pi --model freebuff/deepseek/deepseek-v4-flash
```

---

## 🎮 TUI Manager & CLI

`pi-freebuff` includes a cross-platform TUI manager (`manage.sh` for Unix, `manage.cmd` / `manage.ps1` for Windows, or `npm run manage`).

Run `./manage.sh` to launch the interactive interface:

```text
╔════════════════════════════════════════════════════════════╗
║              pi-freebuff Manager & Updater                 ║
╚════════════════════════════════════════════════════════════╝
 Platform: linux (x64)  | Config: ~/.config/manicode/credentials.json

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

### Command-Line Shortcuts

```bash
./manage.sh list          # View all configured accounts & masked tokens
./manage.sh add <TOKEN>   # Add an additional token to the pool
./manage.sh reset         # Clear lingering cloud sessions (Fixes 409 errors)
./manage.sh help          # View troubleshooting guide & server ping test
./manage.sh uninstall     # Cleanly uninstall from pi CLI settings
```

---

## 💬 In-Session Commands (`/freebuff`)

Manage your Freebuff connection directly inside `pi CLI` TUI without leaving your session:

| Command | Action |
|---|---|
| `/freebuff` | Open interactive menu (Add token, view freebucks balance, rotate account) |
| `/freebuff login` | Displays login link (`https://freebuff.llm.pm`) and opens prompt to paste token |
| `/freebuff add <TOKEN>` | Adds a new token to the active pool immediately |
| `/freebuff rotate` | Force switch to the next standby account in the pool |
| `/model` | Native pi model selector (select under **Freebuff (Native)** group) |

---

## 🪙 Freebucks Coin System

Freebuff no longer uses a simple daily request quota — it now runs on **freebucks coins**:

- Each account receives a daily coin allowance plus a persistent balance.
- Every model has a **coin price** (`freebucks.prices`, e.g. `upstage/solar-pro4` is 0 coins, premium models cost more).
- The session handshake (`POST /api/v1/freebuff/session`) returns `freebucks.balance`, `freebucks.daily.{granted,remaining,resetsAt}`, and `freebucks.prices`.
- `pi-freebuff` reads these fields to display your live balance in `/freebuff` and to proactively rotate accounts **before** coins run out (Proactive Credit Guard).

> Note: Viewing your exact balance via the web protocol requires a web Cookie; the embedded adapter reads whatever the Bearer-token session handshake exposes.

---

## ⚙️ Configuration

Optional environment variables:

| Variable | Description | Default |
|---|---|---|
| `FREEBUFF_AUTH_TOKEN` | Primary auth token (overrides credentials file) | `~/.config/manicode/credentials.json` |
| `FREEBUFF_AUTH_TOKENS` | Comma-separated list of multiple tokens for pool | None |
| `FREEBUFF_HTTP_PROXY` | HTTP/HTTPS proxy URL for upstream requests (e.g. `http://127.0.0.1:7890`) | Direct connection |
| `DEBUG_FREEBUFF` | Enable verbose payload and tool-call debugging | `false` |

---

## 🗺️ Supported Models

| Model ID | Display Name | Freebucks | Context Window |
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
| `openai/gpt-5.6-luna-max` | GPT-5.6 Luna Max | dynamic | 128K |
| `deepseek/deepseek-v4-flash-max` | DeepSeek V4 Flash Max | dynamic | 128K |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | dynamic | 128K |
| `deepseek/deepseek-v4-pro-max` | DeepSeek V4 Pro Max | dynamic | 128K |
| `google/gemini-3.5-flash-lite` | Gemini 3.5 Flash Lite | dynamic | 128K |
| `google/gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite | dynamic | 128K |
| `anthropic/claude-fable-5` | Claude Fable 5 | dynamic | 128K |
| `stealth/ox-alpha` | Ox Alpha | dynamic | 128K |

> Coin prices are per request from a live session and may change (peak pricing applies surcharges). The catalog syncs automatically from the account's `freebucks.prices` table plus the upstream `free-agents.ts` source, so new models appear without updating the plugin. "dynamic" = price not yet observed in a live handshake.

---

## 🤝 Contributing & License

Contributions, bug reports, and feature requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request to the `dev` branch

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

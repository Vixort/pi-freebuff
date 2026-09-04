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
- **Dynamic Model Catalog:** Syncs models directly from Codebuff, including **DeepSeek V4 Flash 07/31**, **MiMo 2.5**, and **Solar Pro 4**.
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
│ [1] Proactive Quota Guard   ► Rotates account before hitting 429 quota  │
│ [2] Humanized Jitter/Pacer  ► 250ms - 550ms micro-delays on rapid bursts│
│ [3] Sticky Session Affinity ► 1 hour / 25 reqs per token (No IP hopping)│
│ [4] Clean Cloud Teardown    ► Sends DELETE /session on exit (No ghosts) │
│ [5] Upstream Proxy Routing  ► Supports Cloudflare WARP & HTTP proxies   │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Proactive Quota Guard:** Upstream returns `recentCount` and `limit` in every session handshake. When an account reaches 90% of its daily quota (`recentCount >= limit - 0.5`), the adapter smoothly switches to a standby account *before* hitting a 429 Rate Limit error that could flag the account.
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
| `/freebuff` | Open interactive menu (Add token, view quota, rotate account) |
| `/freebuff login` | Displays login link (`https://freebuff.llm.pm`) and opens prompt to paste token |
| `/freebuff add <TOKEN>` | Adds a new token to the active pool immediately |
| `/freebuff rotate` | Force switch to the next standby account in the pool |
| `/model` | Native pi model selector (select under **Freebuff (Native)** group) |

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

| Model ID | Display Name | Capabilities | Context Window |
|---|---|:---:|:---:|
| `deepseek/deepseek-v4-flash-0731` | DeepSeek V4 Flash 07/31 (Latest) | Text, Code, Reasoning (Thinking), Tools | 128K |
| `deepseek/deepseek-v4-flash` | DeepSeek V4 Flash | Text, Code, Reasoning (Thinking), Tools | 128K |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | Text, Deep Reasoning | 128K |
| `mimo/mimo-v2.5` | MiMo 2.5 | Text, Code, Multimodal | 128K |
| `upstage/solar-pro4` | Solar Pro 4 | Text, High Precision | 128K |
| `minimax/minimax-m3` | MiniMax M3 | Fast Completions | 128K |

---

## 🤝 Contributing & License

Contributions, bug reports, and feature requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request to the `dev` branch

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

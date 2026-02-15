# Hedge-Edge Desktop App

A professional desktop trading application for managing multiple MT4, MT5, and cTrader accounts with hedging capabilities, license management, and real-time agent communication. Built with Electron, React, Python, and MQL/C#.

![Hedge-Edge](Hedge-Edge-Front-end/public/Hedge%20Edge.jpg)

## Features

- **Multi-Platform Support** – Connect MT4, MT5, and cTrader trading platforms
- **License Management** – Secure license key validation with hardware binding
- **Real-Time Agent Communication** – ZeroMQ (MT5), File IPC (MT4), Named Pipes (cTrader)
- **Multi-Account Management** – Connect and monitor multiple trading accounts
- **Real-Time Data Feeds** – Live account balances, equity, and position updates
- **Hedge Mapping** – Visual representation of hedged positions across accounts
- **Trade Copier** – Copy trades between linked accounts (coming soon)
- **Local-First Architecture** – Your credentials stay on your machine
- **Optional Cloud Sync** – Supabase integration for cross-device access

## Project Structure

```
Hedge-Edge-App/
├── Hedge-Edge-Front-end/     # Electron + React desktop application
│   ├── electron/             # Main process (IPC, license manager, agent supervisor)
│   │   ├── license-manager.ts     # Centralized license management
│   │   ├── webrequest-proxy.ts    # WebRequest proxy for MT4/MT5 (port 8089)
│   │   ├── named-pipe-client.ts   # cTrader Named Pipe communication
│   │   ├── zmq-bridge.ts          # ZeroMQ bridge for MT5
│   │   └── agent-supervisor.ts    # Agent process management
│   ├── src/                  # React UI components
│   │   ├── contexts/LicenseContext.tsx  # License state management
│   │   ├── components/Counter.tsx       # Animated counter component
│   │   └── components/license/          # License UI components
│   ├── testing/              # Front-end test suites
│   │   └── ui/               # UI automation tests (PyAutoGUI, screenshots)
│   ├── build/                # App icons and resources
│   └── package.json
├── Hedge-Edge-Back-end/      # Python API servers + Trading agents
│   ├── license_api_server.py      # Local license API server
│   ├── license_api_production.py  # Production API (api.hedge-edge.com)
│   ├── mt5_api_server.py          # Local MT5 API server
│   ├── agents/               # Trading platform agents
│   │   ├── mt5/              # MetaTrader 5 Expert Advisor
│   │   │   ├── HedgeEdgeLicense.mq5   # Main EA with ZeroMQ
│   │   │   ├── HedgeEdgeLicense.cpp   # License validation DLL (64-bit)
│   │   │   ├── Sodium.mqh             # Crypto library bindings
│   │   │   └── ZMQ.mqh                # ZeroMQ bindings
│   │   ├── mt4/              # MetaTrader 4 Expert Advisor
│   │   │   └── HedgeEdgeLicense.mq4   # Main EA with File IPC
│   │   └── ctrader/          # cTrader cBot
│   │       └── HedgeEdgeLicense.cs    # C# cBot with Named Pipes
│   ├── testing/              # Back-end test suites
│   │   └── api/              # API integration tests
│   ├── scripts/              # Back-end build scripts
│   │   └── agent_build_helper.py  # MT5/cTrader agent compilation
│   └── Dockerfile
├── testing/                  # Cross-cutting test suites
│   └── integration/
│       └── qa001_integration_suite.py  # End-to-end integration tests
├── scripts/                  # Cross-project utilities
│   └── run_all_tests.py      # Master test runner (all suites)
├── tasks/                    # Task management (JSON specs)
├── docs/                     # Architecture & session documentation
└── Hedge-Edge-app.code-workspace
```

## Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (for MT5 integration and License API)
- **MetaTrader 5** terminal installed (Windows only for MT5)
- **MetaTrader 4** terminal installed (optional, 32-bit DLL required)
- **cTrader** terminal installed (optional, Windows Named Pipes)

### 1. Install Frontend Dependencies

```bash
cd Hedge-Edge-Front-end
npm install
```

### 2. Configure Environment

```bash
# Copy example env file
cp .env.desktop.example .env

# Edit .env with your Supabase credentials (optional for cloud sync)
```

### 3. Set Up Python Backend

```bash
cd Hedge-Edge-Back-end
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

### 4. Run in Development Mode

**Terminal 1 – Start License API Server:**
```bash
cd Hedge-Edge-Back-end
python license_api_server.py
```

**Terminal 2 – Start Vite dev server:**
```bash
cd Hedge-Edge-Front-end
npm run vite:dev
```

**Terminal 3 – Start Electron:**
```bash
cd Hedge-Edge-Front-end
npm run electron:dev
```

## License System

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         License Validation Flow                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────────────────┐  │
│  │   MT5 EA    │─────▶│  WebRequest │─────▶│  Electron WebRequest    │  │
│  │  (ZeroMQ)   │      │  Port 8089  │      │       Proxy             │  │
│  └─────────────┘      └─────────────┘      └───────────┬─────────────┘  │
│                                                        │                 │
│  ┌─────────────┐      ┌─────────────┐                  ▼                │
│  │   MT4 EA    │─────▶│  File IPC   │─────▶┌─────────────────────────┐  │
│  │ (32-bit)    │      │  Channel    │      │    License Manager      │  │
│  └─────────────┘      └─────────────┘      │   (Token + Cache)       │  │
│                                            └───────────┬─────────────┘  │
│  ┌─────────────┐      ┌─────────────┐                  │                │
│  │  cTrader    │─────▶│ Named Pipe  │─────▶            │                │
│  │   cBot      │      │   Client    │                  ▼                │
│  └─────────────┘      └─────────────┘      ┌─────────────────────────┐  │
│                                            │    Supabase License     │  │
│                                            │       Database          │  │
│                                            └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### License API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/validate` | POST | Validate license key + hardware ID |
| `/heartbeat` | POST | Keep license session active |
| `/deactivate` | POST | Release license activation |
| `/health` | GET | Health check |

### Platform Communication

| Platform | Protocol | Port/Channel |
|----------|----------|--------------|
| MT5 | ZeroMQ + WebRequest | 51810/51811 + 8089 |
| MT4 | File IPC + WebRequest | File Channel + 8089 |
| cTrader | Named Pipes | `\\.\pipe\HedgeEdge_{pid}` |

## Building for Production

### Windows Installer

```bash
cd Hedge-Edge-Front-end
npm run electron:build:win
```

Output: `dist/Hedge-Edge-Setup-{version}.exe`

### macOS Application

```bash
cd Hedge-Edge-Front-end
npm run electron:build:mac
```

Output: `dist/Hedge-Edge-{version}.dmg`

### MT5 DLL Compilation

```bash
cd Hedge-Edge-Back-end/agents/mt5
# Requires Visual Studio Build Tools
cl /LD /O2 HedgeEdgeLicense.cpp /Fe:HedgeEdgeLicense.dll /link /DEF:HedgeEdgeLicense.def
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Electron Main Process                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   License    │  │  WebRequest  │  │  Named Pipe  │  │    ZMQ      │  │
│  │   Manager    │  │    Proxy     │  │   Client     │  │   Bridge    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                 │                 │                 │         │
│         └─────────────────┴─────────────────┴─────────────────┘         │
│                                   │                                      │
│                          IPC Bridge (preload)                            │
│                                   │                                      │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      React UI (Renderer)                           │  │
│  │   ┌────────────┐  ┌────────────┐  ┌─────────────┐  ┌───────────┐  │  │
│  │   │  License   │  │  Dashboard │  │   Accounts  │  │  Hedge    │  │  │
│  │   │   Panel    │  │            │  │  Management │  │   Map     │  │  │
│  │   └────────────┘  └────────────┘  └─────────────┘  └───────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   MT4 EA     │      │   MT5 EA     │      │   cTrader    │
│  (32-bit)    │      │  (ZeroMQ)    │      │    cBot      │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ MetaTrader 4 │      │ MetaTrader 5 │      │   cTrader    │
│   Terminal   │      │   Terminal   │      │   Terminal   │
└──────────────┘      └──────────────┘      └──────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop Shell | Electron 33 |
| UI Framework | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Build Tool | Vite 5 |
| MT5 Bridge | Python + MetaTrader5 + ZeroMQ |
| MT4 Bridge | File IPC + 32-bit DLL |
| cTrader Bridge | C# Named Pipes |
| License API | FastAPI + Supabase |
| Cloud Sync | Supabase (optional) |
| Packaging | electron-builder |
| Testing | Python unittest + Mock servers |

## Development

### Available Scripts

```bash
# Frontend development
npm run vite:dev          # Start Vite dev server (port 8081)
npm run electron:dev      # Start Electron in dev mode
npm run electron:compile  # Compile TypeScript for Electron

# Backend development (from Hedge-Edge-Back-end/)
python license_api_server.py     # Start local license API
python mt5_api_server.py         # Start MT5 agent server

# Testing (from testing/integration/)
python qa001_integration_suite.py --verbose --mock  # Run integration tests

# Production builds
npm run electron:build:win   # Build Windows installer
npm run electron:build:mac   # Build macOS app
```

### Project Conventions

- Electron main process code in `electron/`
- React components in `src/components/`
- License components in `src/components/license/`
- Trading hooks in `src/hooks/`
- IPC handlers registered in `electron/preload.ts`
- Agent code in `Hedge-Edge-Back-end/agents/{platform}/`
- Task specifications in `tasks/`

## Testing

Run the comprehensive integration test suite:

```bash
cd testing/integration
python qa001_integration_suite.py --verbose --mock
```

Test suites include:
- **License API Suite** – API endpoint validation
- **WebRequest Proxy Suite** – HTTP proxy functionality
- **Named Pipe Suite** – cTrader communication
- **ZMQ Bridge Suite** – MT5 communication
- **End-to-End Suite** – Full workflow testing

## Security

- **Credentials are stored locally** – MT5 passwords never leave your machine
- **Hardware-bound licenses** – Licenses tied to machine hardware ID
- **No telemetry** – The app doesn't phone home
- **Optional cloud sync** – Supabase is opt-in for cross-device features
- **Encrypted storage** – Sensitive data encrypted via Electron safeStorage
- **Rate limiting** – API endpoints protected against abuse

## Troubleshooting

### Electron window doesn't appear
- Ensure Vite is running on port 8081 before starting Electron
- Check `VITE_DEV_SERVER_URL` environment variable

### MT5 connection fails
- Verify MetaTrader 5 terminal is installed and running
- Check credentials in `backend/.env.mt5`
- Ensure the MT5 agent is running on port 5101

### License validation fails
- Check that the license API server is running
- Verify your license key is active in Supabase
- Check network connectivity to api.hedge-edge.com

### cTrader Named Pipe errors
- Ensure cTrader is running with the HedgeEdge cBot loaded
- Check that Windows Named Pipes are not blocked by firewall

### Build errors
- Delete `node_modules` and `package-lock.json`, then `npm install`
- Ensure you're using Node.js 18+

## License

Private repository – All rights reserved.

## Contributing

This is a private project. For questions or feature requests, contact the repository owner.

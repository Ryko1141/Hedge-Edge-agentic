# Hedge Edge - Architecture Overview

## Workspace Structure

```
Hedge-Edge-App/
├── Hedge-Edge-Front-end/      # Desktop application (Electron + React)
│   ├── electron/              # Electron main process
│   ├── src/                   # React frontend
│   ├── build/                 # Build resources (icons, entitlements)
│   ├── testing/               # Front-end test suites
│   │   └── ui/                # UI automation tests
│   └── supabase/              # Database migrations
│
├── Hedge-Edge-Back-end/       # Python API servers + Trading agents
│   ├── license_api_server.py  # Local license API server
│   ├── license_api_production.py  # Production license API
│   ├── mt5_api_server.py      # Local MT5 bridge API
│   ├── agents/                # Trading platform agents (user-facing)
│   │   ├── mt4/               # MetaTrader 4 Expert Advisors
│   │   ├── mt5/               # MetaTrader 5 Expert Advisors + DLLs
│   │   │   ├── lib/           # Pre-built DLLs (libzmq, libsodium)
│   │   │   ├── *.mq5          # EA source files
│   │   │   ├── *.mqh          # MQL5 header/include files
│   │   │   └── *.cpp/.h/.def  # DLL source files
│   │   └── ctrader/           # cTrader cBots
│   │       └── *.cs           # cBot source files (C#)
│   ├── testing/               # Back-end test suites
│   │   └── api/               # API integration tests
│   └── scripts/               # Back-end build scripts
│       └── agent_build_helper.py
│
├── testing/                   # Cross-cutting tests
│   └── integration/           # End-to-end integration tests
│
├── scripts/                   # Cross-project utilities
│   └── run_all_tests.py       # Master test runner
│
├── docs/                      # Documentation
├── tasks/                     # Task management
└── Hedge-Edge-app.code-workspace
```

## Component Communication

```
┌─────────────────────────────────────────────────────────────┐
│                    Hedge Edge Desktop App                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   React UI  │◄──►│  Electron   │◄──►│   ZeroMQ    │     │
│  │  (Renderer) │    │   (Main)    │    │   Client    │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
└────────────────────────────────────────────────┼────────────┘
                                                 │
                    TCP localhost:51810/51811    │
                                                 │
┌────────────────────────────────────────────────┼────────────┐
│                  MetaTrader 5 Terminal         │            │
│  ┌─────────────┐    ┌─────────────┐    ┌──────▼──────┐     │
│  │  Hedge Edge │◄──►│   libzmq    │◄──►│   ZeroMQ    │     │
│  │     EA      │    │  libsodium  │    │   Server    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘

Data Flow:
- EA publishes account snapshots via ZMQ PUB socket (port 51810)
- App subscribes and receives real-time updates
- App sends commands via ZMQ REQ socket (port 51811)
- EA responds with command results

License Validation:
- EA encrypts license payload with libsodium
- Sends to Hedge Edge license API via MQL WebRequest
- Decrypts response; caches valid token
```

## Technology Stack

### Desktop App (Hedge-Edge-Front-end/)
- **Framework**: Electron + Vite
- **Frontend**: React 18 + TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **State**: React Context + Custom Hooks
- **IPC**: Electron IPC + ZeroMQ (zeromq.js)

### Trading Agents (Hedge-Edge-Back-end/agents/)
- **MT5**: MQL5 + Native DLLs (C++)
- **MT4**: MQL4 + Native DLLs (C++)
- **cTrader**: C# cAlgo

### Backend (Hedge-Edge-Back-end/)
- **Runtime**: Python 3.10+
- **MT5 Bridge**: MetaTrader5 Python package
- **API**: FastAPI / Flask

## License Enforcement

All trading agents require a valid Hedge Edge license key:
1. User enters license key in app Settings
2. Key stored securely in OS keychain
3. EA/cBot validates key on startup and periodically
4. Trading disabled if license invalid/expired

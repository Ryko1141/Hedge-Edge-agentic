# Hedge Edge

Hedge Edge is a prop trading hedge account management platform packaged as a desktop (Electron) application.

## Technologies

This project is built with:

- **React 18** - Modern React with hooks
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality React components
- **Supabase** - Backend as a service

## Getting Started (Desktop)

### Prerequisites

- Node.js 18+ and npm installed ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))

### Installation

```sh
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to the project directory
cd hedge-edge

# Install dependencies
npm install

# Start the Electron app in development (renderer served by Vite)
npm run electron:dev
```

## Available Scripts

- `npm run electron:dev` - Run Electron with hot-reload (Vite renderer + Electron main)
- `npm run electron:build` - Build production desktop binaries (all platforms configured)
- `npm run electron:build:win` - Build Windows installer/portable
- `npm run electron:build:mac` - Build macOS dmg/zip
- `npm run electron:build:all` - Build both Windows and macOS artifacts
- `npm run lint` - Run ESLint

## Features

- **Account Management** - Track Evaluation, Funded, and Hedge accounts
- **Real-time Dashboard** - Monitor all your trading accounts in one place
- **Account Credentials** - Securely store platform login details
- **Local Storage Fallback** - Works offline with localStorage demo mode
- **Responsive Design** - Works on desktop and mobile devices

## Project Structure

```
src/
├── components/        # React components
│   ├── dashboard/    # Dashboard-specific components
│   └── ui/           # Reusable UI components
├── contexts/         # React contexts (Auth, etc.)
├── hooks/            # Custom React hooks
├── pages/            # Page components
└── lib/              # Utility functions
```

## Environment Variables

Create a `.env` file in the root directory:

```bash
# Supabase Configuration (optional - for cloud sync/auth)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
```

### Local Trading Agents

The desktop app connects directly to local MT5/cTrader terminals via bundled or external agents:

- **MT5 Agent**: Runs alongside MT5 terminal on the same machine
- **cTrader Agent**: Runs alongside cTrader terminal on the same machine

Agent configuration is managed in Settings → Agents within the app.

See `.env.desktop.example` for reference.

## License

MIT

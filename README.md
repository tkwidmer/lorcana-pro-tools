# InkbornForge — Lorcana Pro Tools

Tools for competitive Disney Lorcana players, live at [inkbornforge.com](https://www.inkbornforge.com). It covers deck consistency maths, personal analytics from your duels.ink games, meta reports, pre-event practice planning, live tournament standings with ID analysis, opponent scouting, a versioned rules browser, and printable proxies.

**Player guide:** [docs/TOOLS.md](docs/TOOLS.md) covers every tool, what it needs, and where your data lives.

**Roadmap ideas:** [docs/FEATURE_PROPOSALS.md](docs/FEATURE_PROPOSALS.md).

## Stack

React 19, React Router 7, Tailwind CSS 4, and Vite 8, deployed on Vercel with serverless routes in `api/`. Supabase handles auth (Google OAuth), supporter tiers, and a few server-side tables. Card data comes from [LorcanaJSON](https://lorcanajson.org/). The repo also includes a Chrome extension (`chrome-extension/`) and a Discord bot (`api/discord-interactions.ts`, `discord-bot/`).

## Development

```bash
npm install
npm run dev        # Vite dev server
npm test           # Vitest unit suite
npm run lint       # ESLint
npm run build      # Build app + package the Chrome extension
```

Local development needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. See [CLAUDE.md](CLAUDE.md) for the full architecture, environment variables, and conventions.

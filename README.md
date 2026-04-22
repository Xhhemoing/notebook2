<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/997c92b7-a9b3-43c0-abce-7b5fde3fff7c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Sync Contract (`/api/sync`)

- Sync now uses `syncKey` only.
- `Authorization` is not required.
- Server accepts `syncKey` from either:
  - request body field: `syncKey`
  - request header: `X-Sync-Key` (takes precedence when both exist)
- Missing or invalid `syncKey` (length < 4) returns `400`.

## Run with Docker

**Prerequisites:** Docker + Docker Compose

1. Copy environment template:
   `cp .env.docker.example .env.docker`
2. Edit `.env.docker` and set `GEMINI_API_KEY`.
3. Build and start:
   `docker compose up --build`
4. Open:
   `http://localhost:3000`

### Build image only

`docker build -t ai-studio-applet:local .`

## CI

GitHub Actions workflow is available at `.github/workflows/ci.yml`.
It runs:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`
5. `docker build`

No image push is performed.

## Troubleshooting

- **`Sync Key is required`**: set a valid `syncKey` (at least 4 chars) in Settings → 数据同步.
- **Docker app starts but AI requests fail**: check `GEMINI_API_KEY` in `.env.docker`.
- **Cloudflare D1 not available in local Docker**: expected. Docker is a parallel runtime path; D1 binding is for Cloudflare deployment.

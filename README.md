# Pixr — Infinite Canvas Image Board

Organize images on infinite, pannable/zoomable canvases. Multiple named canvases, drag-and-drop uploads, real-time sync across all connected clients.

**Stack:** React + Vite + TypeScript · Convex (backend & realtime) · S3-compatible storage (MinIO locally, AWS S3 in prod) · Tailwind CSS v4 + shadcn/ui

---

## Local Development

### Prerequisites

- Node.js 18+
- Docker Desktop (for MinIO)

### 1. Install dependencies

```bash
npm install
```

### 2. Start MinIO

```bash
docker compose up -d
```

MinIO API runs on `:9000`, console on `:9001` (login: `minioadmin` / `minioadmin`).

### 3. Start Convex (local)

```bash
npx convex dev
```

On first run this sets up a local Convex deployment and writes `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to `.env.local`.

Then set the S3 environment variables so Convex can talk to MinIO:

```bash
npx convex env set S3_ENDPOINT http://localhost:9000
npx convex env set S3_BUCKET canvas-images
npx convex env set S3_ACCESS_KEY_ID minioadmin
npx convex env set S3_SECRET_ACCESS_KEY minioadmin
npx convex env set S3_REGION us-east-1
npx convex env set S3_FORCE_PATH_STYLE true
```

Keep `npx convex dev` running — it watches `convex/` and hot-deploys changes.

### 4. Start the frontend

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Production Deployment

### Convex

Deploy the backend to Convex cloud:

```bash
npx convex deploy
```

Then set environment variables in the [Convex dashboard](https://dashboard.convex.dev) under **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `S3_ENDPOINT` | `https://s3.amazonaws.com` (or your S3-compatible endpoint) |
| `S3_BUCKET` | Your bucket name |
| `S3_ACCESS_KEY_ID` | Your AWS access key |
| `S3_SECRET_ACCESS_KEY` | Your AWS secret key |
| `S3_REGION` | e.g. `us-east-1` |
| `S3_FORCE_PATH_STYLE` | `false` (AWS) or `true` (MinIO/other) |

### Frontend

Build and deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages):

```bash
npm run build
```

Set `VITE_CONVEX_URL` as a build-time environment variable — its value is the deployment URL shown in the Convex dashboard (e.g. `https://your-deployment.convex.cloud`).

### S3 Bucket CORS

The browser uploads directly to S3, so your bucket needs a CORS rule allowing your app's origin:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedOrigins": ["https://your-app-domain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

For local dev with MinIO, allow `http://localhost:5173` via the MinIO console (`http://localhost:9001`) or `mc`:

```bash
mc alias set local http://localhost:9000 minioadmin minioadmin
mc anonymous set download local/canvas-images
```

---

## Project Structure

```
convex/          # Convex backend (schema, queries, mutations, HTTP actions)
src/
  components/    # React components (CanvasView, Sidebar, Toolbar, etc.)
  hooks/         # useCanvas (pan/zoom), useImages (optimistic state)
  lib/           # env.ts (config), s3.ts (upload helpers)
```

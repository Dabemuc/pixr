# Pixr — Infinite Canvas Image Board

Organize images on infinite, pannable/zoomable canvases. Multiple named canvases, folders, drag-and-drop uploads, real-time sync across all connected clients.

**Stack:** React + Vite + TypeScript · Convex (backend & realtime) · Clerk (auth) · S3-compatible storage (MinIO locally, AWS S3 / Cloudflare R2 in prod) · Tailwind CSS v4 + shadcn/ui

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

On first run this sets up a local Convex deployment and writes `VITE_CONVEX_URL` to `.env.local`.

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

### 1. Deploy the Convex backend

```bash
npx convex deploy
```

Then set environment variables in the [Convex dashboard](https://dashboard.convex.dev) under **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `S3_ENDPOINT` | See [Storage providers](#storage-providers) below |
| `S3_BUCKET` | Your bucket name |
| `S3_ACCESS_KEY_ID` | Your access key |
| `S3_SECRET_ACCESS_KEY` | Your secret key |
| `S3_REGION` | See [Storage providers](#storage-providers) below |
| `S3_FORCE_PATH_STYLE` | See [Storage providers](#storage-providers) below |

### 2a. Deploy the frontend — Docker

Build and run the container, passing both Vite build args (baked into the JS bundle at build time):

```bash
docker build \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_... \
  --build-arg VITE_CONVEX_URL=https://your-deployment.convex.cloud \
  -t pixr .

docker run -p 80:80 pixr
```

The image uses nginx to serve the static assets and handles React Router's client-side routing automatically.

### 2b. Deploy the frontend — Static host (Vercel, Netlify, Cloudflare Pages)

```bash
npm run build
```

Set these as build-time environment variables on your host:

| Variable | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Your Clerk publishable key |
| `VITE_CONVEX_URL` | Your Convex deployment URL |

Deploy the `dist/` output directory. Configure your host to serve `index.html` for all routes (SPA fallback).

---

## Storage Providers

### AWS S3

| Variable | Value |
|---|---|
| `S3_ENDPOINT` | `https://s3.amazonaws.com` |
| `S3_REGION` | e.g. `us-east-1` |
| `S3_FORCE_PATH_STYLE` | `false` |

### Cloudflare R2

R2 is fully S3-compatible — no code changes needed. Use these values:

| Variable | Value |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_FORCE_PATH_STYLE` | `false` |

Get your **Account ID** from the Cloudflare dashboard home page. Generate **Access Key ID** and **Secret Access Key** under R2 → Manage R2 API Tokens.

**CORS on R2:** Set the CORS policy in the Cloudflare dashboard under R2 → your bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### MinIO (local dev)

| Variable | Value |
|---|---|
| `S3_ENDPOINT` | `http://localhost:9000` |
| `S3_REGION` | `us-east-1` (any value works) |
| `S3_FORCE_PATH_STYLE` | `true` |

---

## Bucket CORS (AWS S3)

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

---

## Project Structure

```
convex/          # Convex backend (schema, queries, mutations, HTTP actions)
src/
  components/    # React components (CanvasView, Sidebar, Toolbar, etc.)
  hooks/         # useCanvas (pan/zoom), useImages (optimistic state)
  lib/           # env.ts (config), s3.ts (upload helpers)
Dockerfile       # Multi-stage build: node (Vite build) → nginx (static serve)
nginx.conf       # SPA routing + asset cache headers
```

# Infinite Canvas Image Board — Application Specification

## 1. Overview

A real-time collaborative web application that lets users organize images on infinite, pannable/zoomable canvases. Users can maintain multiple named canvases, upload images that are stored in an S3-compatible bucket, and see changes reflected live across all connected clients via Convex.

---

## 2. Tech Stack

| Layer              | Technology                                                   |
| ------------------ | ------------------------------------------------------------ |
| Frontend           | React (Vite), TypeScript                                     |
| UI / Theming       | shadcn/ui + Tailwind CSS                                     |
| Backend / Realtime | Convex                                                       |
| Image Storage      | S3-compatible object storage (AWS S3 in prod, MinIO locally) |
| Local Dev Infra    | Docker Compose                                               |
| Deployment Target  | Any Node-capable host (Vercel, Railway, etc.)                |

---

## 3. Environment Modes

### 3.1 Local (Docker Compose)

Docker Compose manages only the services that run on the developer's machine. **Convex is not self-hosted** — even in local dev, it runs as a free Convex cloud _dev_ deployment. This requires an internet connection and a free Convex account, but avoids the complexity of self-hosting Convex infrastructure.

```
services:
  minio:          # S3-compatible storage, exposed on :9000 (API) + :9001 (console)
  minio-init:     # One-shot container that creates the default bucket on startup
```

> **Note:** The Vite dev server and `npx convex dev` are run directly on the host machine, not inside Docker.

Environment is configured via `.env.local`:

```
VITE_CONVEX_URL=<dev deployment URL from `npx convex dev`>
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=canvas-images
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true        # Required for MinIO
APP_ENV=local
```

### 3.2 Production

Environment is configured via platform secrets / `.env.production`:

```
VITE_CONVEX_URL=<prod Convex deployment URL>
S3_ENDPOINT=https://s3.amazonaws.com   # or any S3-compatible endpoint
S3_BUCKET=<bucket-name>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=<region>
S3_FORCE_PATH_STYLE=false
APP_ENV=production
```

A helper `src/lib/env.ts` module exports typed, validated env values and throws at startup if required vars are missing.

---

## 4. Application Structure

```
/
├── convex/                    # Convex backend
│   ├── schema.ts
│   ├── canvases.ts            # Canvas CRUD mutations + queries
│   ├── images.ts              # Image CRUD mutations + queries
│   └── storage.ts             # Signed URL generation (HTTP action)
├── src/
│   ├── lib/
│   │   ├── env.ts             # Typed env config
│   │   └── s3.ts              # S3 client factory (local vs prod)
│   ├── components/
│   │   ├── ui/                # shadcn generated components
│   │   ├── Sidebar.tsx
│   │   ├── CanvasView.tsx
│   │   ├── CanvasImage.tsx
│   │   ├── Toolbar.tsx
│   │   └── UploadZone.tsx
│   ├── hooks/
│   │   ├── useCanvas.ts
│   │   └── useImages.ts
│   ├── App.tsx
│   └── main.tsx
├── docker-compose.yml
├── .env.local.example
├── .env.production.example
└── vite.config.ts
```

---

## 5. Data Model (Convex Schema)

### 5.1 `canvases` table

| Field           | Type             | Notes                              |
| --------------- | ---------------- | ---------------------------------- |
| `_id`           | `Id<"canvases">` | Auto                               |
| `_creationTime` | `number`         | Auto                               |
| `name`          | `string`         | Display name, editable             |
| `description`   | `string?`        | Optional                           |
| `updatedAt`     | `number`         | Timestamp, updated on any mutation |

### 5.2 `images` table

| Field           | Type             | Notes                                    |
| --------------- | ---------------- | ---------------------------------------- |
| `_id`           | `Id<"images">`   | Auto                                     |
| `_creationTime` | `number`         | Auto                                     |
| `canvasId`      | `Id<"canvases">` | Foreign key                              |
| `storageKey`    | `string`         | S3 object key                            |
| `filename`      | `string`         | Original filename                        |
| `mimeType`      | `string`         | e.g. `image/jpeg`                        |
| `width`         | `number`         | Intrinsic pixel width                    |
| `height`        | `number`         | Intrinsic pixel height                   |
| `x`             | `number`         | Canvas X position (pixels, canvas space) |
| `y`             | `number`         | Canvas Y position (pixels, canvas space) |
| `w`             | `number`         | Rendered width on canvas                 |
| `h`             | `number`         | Rendered height on canvas                |
| `zIndex`        | `number`         | Stacking order                           |
| `updatedAt`     | `number`         | Timestamp                                |

---

## 6. Convex Backend API

### 6.1 Canvases

```ts
// queries
canvases.list()               → Canvas[]          // all canvases, ordered by updatedAt desc
canvases.get(id)              → Canvas | null

// mutations
canvases.create({ name, description? })    → Id<"canvases">
canvases.rename({ id, name })              → void
canvases.delete({ id })                    → void  // also deletes all child images from S3 + DB
```

### 6.2 Images

```ts
// queries
images.listByCanvas({ canvasId })          → Image[]

// mutations
images.add({ canvasId, storageKey, filename, mimeType, width, height, x, y, w, h })  → Id<"images">
images.move({ id, x, y })                 → void
images.resize({ id, x, y, w, h })         → void
images.reorder({ id, zIndex })            → void
images.delete({ id })                     → void  // removes from S3 + DB
```

### 6.3 Storage (HTTP Action)

```
POST /api/upload-url
  Body: { filename: string, mimeType: string, canvasId: string }
  Returns: { uploadUrl: string, storageKey: string }
  — Generates a pre-signed S3 PUT URL valid for 5 minutes.

GET /api/image-url?key=<storageKey>
  Returns: { url: string }
  — Generates a pre-signed S3 GET URL valid for 1 hour.
```

The S3 client is instantiated inside the Convex HTTP action using environment variables set in the Convex dashboard (prod) or `.env.local` (local dev via `convex dev`).

---

## 7. Frontend Features

### 7.1 Sidebar

- Rendered as a fixed left panel using shadcn `Sheet` or a static sidebar layout.
- Lists all canvases from `canvases.list()` (live, reactive).
- Each entry shows: name, relative timestamp ("2 hours ago").
- Active canvas is highlighted.
- Actions per canvas (via `DropdownMenu`): Rename (inline edit), Delete (confirm dialog).
- "New Canvas" button at the top opens a `Dialog` with a name field.
- Sidebar is collapsible on narrow viewports.

### 7.2 Canvas View

The canvas is a full-viewport interactive surface built without a canvas element — use a CSS-transformed `div` container so images remain as DOM elements (accessible, selectable).

**Pan:** Click and drag on empty canvas area. Cursor changes to `grab` / `grabbing`.

**Zoom:** Mouse wheel or trackpad pinch. Range: 10% – 400%. Current zoom shown in Toolbar.

**State:** `{ x: number, y: number, scale: number }` stored in local React state (not synced — each user has their own viewport).

**Transform applied to inner container:**

```css
transform: translate(${vx}px, ${vy}px) scale(${scale});
transform-origin: 0 0;
```

### 7.3 Images on Canvas

Each image is a positioned `div` inside the canvas container:

```css
position: absolute;
left: {image.x}px;
top: {image.y}px;
width: {image.w}px;
height: {image.h}px;
z-index: {image.zIndex};
```

**Interactions:**

| Action         | Behaviour                                          |
| -------------- | -------------------------------------------------- |
| Click          | Select (shows resize handles, brings to front)     |
| Drag           | Move; on `pointerup` call `images.move()` mutation |
| Resize handles | 8-handle resize; on release call `images.resize()` |
| Right-click    | Context menu: Bring to Front, Send to Back, Delete |
| Double-click   | Open full image in a modal lightbox                |

Moves and resizes are **optimistic** — update local state immediately, sync to Convex on release. Other clients see the update via Convex reactivity within ~100 ms.

### 7.4 Upload

- Toolbar contains an "Upload Images" button.
- Also supports **drag-and-drop** anywhere on the canvas surface.
- Accepted types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- Max file size: 20 MB per file.
- Upload flow:
  1. Client requests a pre-signed PUT URL from `/api/upload-url`.
  2. Client PUTs the file directly to S3 from the browser.
  3. On success, client reads intrinsic image dimensions via `new Image()`.
  4. Client calls `images.add()` mutation — image appears on canvas for all clients.
- Multiple files can be uploaded in parallel.
- Progress is shown per-file in a `Toast` notification.
- Dropped images are placed at the current viewport center in canvas coordinates.

### 7.5 Toolbar

Fixed bar at the top of the canvas area:

- Canvas name (editable inline on click).
- Zoom controls: `-` button, zoom percentage display, `+` button, "Reset" (100%).
- Upload button.
- (Future) Share / export button placeholder.

### 7.6 Empty States

- No canvases: Full-page empty state with "Create your first canvas" CTA.
- Canvas with no images: Centered prompt "Drop images here or click Upload".

---

## 8. Realtime Sync Behaviour

Convex queries are reactive by default. All clients subscribed to `images.listByCanvas({ canvasId })` receive updates automatically when any mutation is committed.

**Conflict strategy:** Last-write-wins on position/size. No locking. This is acceptable for a single-user or small-team tool.

**Presence (optional, v2):** Use Convex's presence pattern to show which users are viewing the same canvas (coloured cursors).

---

## 9. Theming

- Use shadcn `ThemeProvider` with light/dark mode toggle in the sidebar footer.
- CSS variables from shadcn define all colours; no hardcoded hex values in component files.
- Default theme: system preference.

---

## 10. Error Handling

| Scenario                                   | Behaviour                                         |
| ------------------------------------------ | ------------------------------------------------- |
| Upload fails (S3 error)                    | Toast with error message; file not added to DB    |
| Convex mutation fails                      | Toast error; optimistic state is rolled back      |
| Image fails to load (broken S3 key)        | Placeholder with broken-image icon + filename     |
| Canvas not found (deleted by another user) | Redirect to first available canvas or empty state |

---

## 11. Docker Compose (Local Dev)

```yaml
# docker-compose.yml
version: "3.9"
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin &&
        mc mb --ignore-existing local/canvas-images &&
        mc anonymous set download local/canvas-images
      "

volumes:
  minio_data:
```

Start local dev:

```bash
docker compose up -d          # starts MinIO only
npx convex dev                # connects to Convex cloud dev deployment (requires internet + Convex account)
npm run dev                   # starts Vite dev server
```

On first run, `npx convex dev` will prompt you to log in and will create a free dev deployment. The deployment URL is automatically written to `.env.local` as `CONVEX_URL` and picked up by Vite via `VITE_CONVEX_URL`.

---

## 12. Deployment (Production)

### Convex

```bash
npx convex deploy
```

Set environment variables in the Convex dashboard under **Settings → Environment Variables**:

- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_REGION`
- `S3_FORCE_PATH_STYLE`
- `APP_ENV=production`

### Frontend

Build:

```bash
npm run build
```

Deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages). Set `VITE_CONVEX_URL` as a build-time environment variable.

### S3 Bucket CORS (Required)

The browser uploads directly to S3, so the bucket must allow CORS from the app origin:

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

For local dev, allow `http://localhost:5173` (MinIO console can set this, or use `mc`).

---

## 13. Out of Scope (v1)

- User authentication / multi-user accounts (all data is shared/public in v1)
- Canvas sharing via link with permissions
- Image annotations or drawing tools
- Undo / redo history
- Mobile touch support (pan/zoom via touch events)

These are noted as planned for future versions.

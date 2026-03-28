# --- Build stage ---
FROM node:22-alpine AS builder

WORKDIR /app

# Build-time env vars (baked into the JS bundle by Vite)
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CONVEX_URL

ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


# --- Runtime stage ---
FROM nginx:alpine AS runner

# SPA routing: serve index.html for all unknown paths (React Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

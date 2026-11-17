# ---- deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run ----
FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=10000 HOSTNAME=0.0.0.0

# LibreOffice (Writer only, headless) for DOCX -> PDF, plus metric-compatible fonts:
# Carlito = Calibri, Caladea = Cambria, Liberation = Arial/Times New Roman.
# These keep line breaks and page breaks identical to Word.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui fonts-crosextra-carlito fonts-crosextra-caladea \
      fonts-liberation2 fonts-dejavu-core fontconfig ca-certificates \
    && fc-cache -f && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
RUN mkdir -p /tmp && chown -R node:node /app /tmp
USER node
EXPOSE 10000
CMD ["node", "server.js"]

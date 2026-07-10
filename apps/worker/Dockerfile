# Build context must be the repository root (monorepo workspaces):
#   docker build -f apps/worker/Dockerfile .
# On Railway, set "Dockerfile Path" to apps/worker/Dockerfile with root context.
FROM node:22-alpine

# Local render engine (exports) runs native ffmpeg.
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install with the workspace graph so @merai/core resolves.
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
RUN npm ci --workspace @merai/worker --include-workspace-root

COPY packages/core packages/core
COPY apps/worker apps/worker

CMD ["npm", "run", "start", "-w", "@merai/worker"]

# Use Node.js 22 LTS
FROM node:22.13.0-alpine AS base

# Install pnpm globally via npm
RUN npm install -g pnpm@10.4.1

# Set working directory
WORKDIR /app

# Copy package files and patches
COPY package.json ./
COPY patches ./patches

# Install dependencies
FROM base AS dependencies
RUN pnpm store prune
RUN pnpm install --no-frozen-lockfile

# Build stage
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:22.13.0-alpine AS production

# Install pnpm globally via npm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copy package files, patches and install production dependencies only
COPY package.json ./
COPY patches ./patches
RUN pnpm store prune
RUN pnpm install --prod --no-frozen-lockfile

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/public ./client/public
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/drizzle ./drizzle

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["pnpm", "start"]

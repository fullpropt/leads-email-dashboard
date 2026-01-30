# Use Node.js 22 LTS
FROM node:22.13.0-alpine AS base

# Install pnpm globally via npm
RUN npm install -g pnpm@10.4.1

# Set working directory
WORKDIR /app

# Copy package files and patches
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install dependencies with frozen lockfile for reproducibility
FROM base AS dependencies
RUN pnpm install

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

# Copy package files and patches
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install ALL dependencies (including devDependencies needed for migrations)
RUN pnpm install --frozen-lockfile

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/public ./client/public
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

# Copy the startup script
COPY start.sh ./
RUN chmod +x start.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http' ).get('http://localhost:3000', (r ) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
CMD ["./start.sh"]
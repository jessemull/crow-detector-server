# Multi-stage build for production.

FROM node:22-alpine AS builder

# Set working directory.

WORKDIR /app

# Copy package files.

COPY package*.json ./

# Install all dependencies (including dev dependencies) for building.

RUN npm ci

# Copy source code.

COPY . .

# Build the application.

RUN npm run build

# Production stage.

FROM node:22-alpine AS production

# Install dumb-init for proper signal handling.

RUN apk add --no-cache dumb-init

# Create app user for security.

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Set working directory.

WORKDIR /app

# Copy package files.

COPY package*.json ./

# Install only production dependencies, skipping prepare script.

RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built application from builder stage.

COPY --from=builder --chown=nestjs:nodejs /app/dist/src ./dist

# Copy any additional files needed at runtime.

COPY --chown=nestjs:nodejs .env* ./

# Switch to non-root user.

USER nestjs

# Expose port.

EXPOSE 3000

# Health check.

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Use dumb-init to handle signals properly.

ENTRYPOINT ["dumb-init", "--"]

# Start the application.

CMD ["node", "dist/main.js"]

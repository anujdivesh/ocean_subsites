# Multi-stage build: Build with Node.js, serve with nginx
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install ALL dependencies needed for build (including dev if any) then prune later
RUN npm ci

# Copy all source files
COPY . .

# Build the React application (will place assets in /app/build)
RUN npm run build

# Optionally remove dev dependencies to shrink final image layer snapshot
RUN npm prune --production

# Production stage: Use nginx to serve the built files
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
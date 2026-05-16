# ==========================================
# Stage 1: Build the React app (Node.js)
# ==========================================
FROM node:22-alpine as builder

# Set working directory
WORKDIR /app

# Install dependencies first (caching layer)
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source files and build
COPY . .
# This will output the optimized static files to the /app/dist directory
RUN npm run build


# ==========================================
# Stage 2: Serve the app with Nginx
# ==========================================
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy the built static files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our custom Nginx configuration file
# This handles React routing and proxies API/WebSocket requests to the backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose the port (same as Vite was using so we don't have to change docker-compose.yml)
EXPOSE 3000

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
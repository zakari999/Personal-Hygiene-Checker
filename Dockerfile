FROM node:20-alpine

# Install git (required for repository cloning and commit history analysis)
RUN apk add --no-cache git

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Set default production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server/server.js"]

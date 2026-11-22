FROM node:22-alpine

WORKDIR /app

# Install OpenSSL and libc6-compat for Prisma engine on Alpine Linux
RUN apk add --no-cache openssl libc6-compat

# Copy package dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies needed for tests and development)
RUN npm ci

# Copy project source files
COPY . .

# Generate Prisma Client with Linux musl engine
RUN npx prisma generate

# Normalize line endings and set permissions for entrypoint script
RUN sed -i -e 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]

CMD ["npm", "start"]

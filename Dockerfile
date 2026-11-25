FROM node:22-alpine

WORKDIR /app

# Install OpenSSL and libc6-compat for Prisma engine on Alpine Linux
RUN apk add --no-cache openssl libc6-compat

# Copy package dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies needed for tests and development)
RUN npm ci

# Copy entrypoint script to /usr/local/bin to prevent host volume mount overwrites
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i -e 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy project source files
COPY . .

# Generate Prisma Client with Linux musl engine
RUN npx prisma generate

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["npm", "start"]

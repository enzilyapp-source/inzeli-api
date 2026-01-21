# Simple build for Nest + Prisma on Debian (avoids Alpine native issues)
FROM node:20-bullseye-slim

WORKDIR /app

# Install deps (include dev deps for build)
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

# App source
COPY . .

# Build Nest
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start:prod"]

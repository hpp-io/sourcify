# Can be run from services/backfill directory: `docker build -t sourcify-backfill .`

# Builder image
FROM node:22.19-bookworm AS builder

RUN mkdir -p /home/app/services/backfill
WORKDIR /home/app/services/backfill

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

######################
## Production image ##
######################
FROM node:22.19-bookworm-slim AS production

RUN mkdir -p /home/app/services/backfill
WORKDIR /home/app/services/backfill

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /home/app/services/backfill/dist ./dist

LABEL org.opencontainers.image.licenses MIT

# Set default value for ARG
ARG NODE_ENV=production

# Set environment variable
ENV NODE_ENV=${NODE_ENV}

# Create volume mount points for config and state files
VOLUME ["/home/app/services/backfill/config", "/home/app/services/backfill/state"]

WORKDIR /home/app/services/backfill
# node command has to be used directly for SIGTERM handling (NOT npm start)
CMD ["npm", "start"]

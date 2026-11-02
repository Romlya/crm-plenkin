FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY tools ./tools

ENV PORT=7788
ENV CRM_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 7788

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:7788/api/health || exit 1

CMD ["node", "server.js"]

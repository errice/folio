FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/folio.sqlite
WORKDIR /app
COPY --chown=node:node public ./public
COPY --chown=node:node app/frontend.html ./app/frontend.html
COPY --chown=node:node lib/finance-store.mjs ./lib/finance-store.mjs
COPY --chown=node:node standalone ./standalone
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md ./
COPY --chown=node:node licenses ./licenses
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "standalone/server.mjs"]

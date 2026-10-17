FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages packages
COPY scripts scripts
RUN npm ci
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 SEED_ON_START=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/phone/package.json packages/phone/package.json
COPY packages/mcp-app/package.json packages/mcp-app/package.json
COPY packages/simulator/package.json packages/simulator/package.json
RUN npm ci --omit=dev
COPY --from=build /app/packages/schema/dist packages/schema/dist
COPY --from=build /app/packages/schema/src/region-packs packages/schema/dist/region-packs
COPY --from=build /app/packages/schema/json-schema packages/schema/json-schema
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/ui/dist packages/ui/dist
COPY --from=build /app/packages/phone/dist packages/phone/dist
COPY --from=build /app/packages/mcp-app/dist packages/mcp-app/dist
COPY --from=build /app/packages/simulator/dist packages/simulator/dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
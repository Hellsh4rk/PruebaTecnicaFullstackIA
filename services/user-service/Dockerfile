FROM node:22-alpine AS build
WORKDIR /app
COPY shared/contracts /app/shared/contracts
COPY shared/platform /app/shared/platform
RUN cd /app/shared/contracts && npm install --no-audit --no-fund && npm run build \
 && cd /app/shared/platform && npm install --no-audit --no-fund && npm run build
COPY services/user-service /app/services/user-service
WORKDIR /app/services/user-service
RUN npm install --no-audit --no-fund && npm run build \
 && rm -rf /app/shared/platform/node_modules/@nestjs /app/shared/platform/node_modules/reflect-metadata /app/shared/platform/node_modules/rxjs \
 && ln -s /app/services/user-service/node_modules/@nestjs /app/shared/platform/node_modules/@nestjs \
 && ln -s /app/services/user-service/node_modules/reflect-metadata /app/shared/platform/node_modules/reflect-metadata \
 && ln -s /app/services/user-service/node_modules/rxjs /app/shared/platform/node_modules/rxjs \
 && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/shared /app/shared
COPY --from=build /app/services/user-service /app/services/user-service
WORKDIR /app/services/user-service
USER node
CMD ["node", "dist/main.js"]

ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE} AS base

WORKDIR /workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY . .
RUN corepack pnpm install --frozen-lockfile

FROM base AS development

ENV NODE_ENV=development
ENV APP_NAME=api

CMD ["corepack", "pnpm", "--filter", "@reviewo/api", "dev"]

FROM base AS production

ENV NODE_ENV=production
ENV APP_NAME=api

RUN corepack pnpm build
RUN chown -R node:node /workspace

USER node

CMD ["corepack", "pnpm", "--filter", "@reviewo/api", "start:prod"]

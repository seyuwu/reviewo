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
ENV APP_NAME=web

CMD ["corepack", "pnpm", "--filter", "@reviewo/web", "dev"]

FROM base AS production

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NODE_ENV=production
ENV APP_NAME=web

RUN corepack pnpm --filter @reviewo/web build

CMD ["corepack", "pnpm", "--filter", "@reviewo/web", "start"]

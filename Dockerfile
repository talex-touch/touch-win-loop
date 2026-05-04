FROM node:20-alpine AS build-stage

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store-${TARGETPLATFORM},sharing=locked,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

COPY . .

ARG WINLOOP_BUILD_VERSION=
ARG WINLOOP_BUILD_COMMIT_SHA=
ARG WINLOOP_SENTRY_ORG=
ARG WINLOOP_SENTRY_PROJECT=
ARG WINLOOP_SENTRY_RELEASE=

ENV WINLOOP_BUILD_VERSION=${WINLOOP_BUILD_VERSION}
ENV WINLOOP_BUILD_COMMIT_SHA=${WINLOOP_BUILD_COMMIT_SHA}
ENV WINLOOP_SENTRY_ORG=${WINLOOP_SENTRY_ORG}
ENV WINLOOP_SENTRY_PROJECT=${WINLOOP_SENTRY_PROJECT}
ENV WINLOOP_SENTRY_RELEASE=${WINLOOP_SENTRY_RELEASE}

RUN --mount=type=secret,id=sentry_auth_token,required=false \
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" && \
    pnpm build

# SSR
FROM node:20-alpine AS production-stage

WORKDIR /app

COPY --from=build-stage /app/.output ./.output

EXPOSE 3000

CMD ["node", "--import", "./.output/server/sentry.server.config.mjs", ".output/server/index.mjs"]

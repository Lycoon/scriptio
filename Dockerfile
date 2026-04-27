FROM node:25.2.1-alpine

RUN apk add --no-cache openssl
RUN apk add --no-cache libc6-compat
RUN apk add --no-cache git

WORKDIR /usr/app
COPY ./package*.json ./
RUN npm install
COPY ./ ./

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

ARG NEXT_PUBLIC_API_URL=https://scriptio.app
ARG NEXT_PUBLIC_COMMIT_SHA
ARG NEXT_PUBLIC_APP_VERSION

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN chown -R node:node .
USER node
RUN npm run build

EXPOSE 3000
ENV NEXT_TELEMETRY_DISABLED=1

CMD npx prisma migrate deploy && npm start
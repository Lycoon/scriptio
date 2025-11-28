FROM node:20-alpine

RUN apk add --no-cache libc6-compat
RUN apk add --no-cache git

WORKDIR /usr/app
COPY ./package*.json ./
RUN npm install
COPY ./ ./

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN npx prisma generate
RUN npm run build

EXPOSE 3000
USER node
ENV NEXT_TELEMETRY_DISABLED 1

CMD [ "npm", "start" ]
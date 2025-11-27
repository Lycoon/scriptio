FROM node:20-alpine
RUN apk add --no-cache libc6-compat

WORKDIR /usr/app
COPY ./package*.json ./
RUN npm install
COPY ./ ./

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN npx prisma generate
RUN npm run Build

EXPOSE 3000
USER node
ENV NEXT_TELEMETRY_DISABLED 1

CMD [ "npm", "start" ]
# Build the static export...
FROM node:25.2.1-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ...then serve it with a tiny, stateless nginx. No Node runtime, no DB, nothing
# that can fail at start — this container only ever cycles when the homepage
# itself changes.
FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80

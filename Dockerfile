FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY core ./core
COPY public ./public
COPY tools ./tools
ENV HOST=0.0.0.0 PORT=4173 DATA_DIR=/app/data
EXPOSE 4173
CMD ["node", "server.mjs"]


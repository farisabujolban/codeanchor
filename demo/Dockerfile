FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY dist/bundle.js .

CMD ["node", "bundle.js"]

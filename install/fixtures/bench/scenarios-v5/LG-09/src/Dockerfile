FROM node:20
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
ENV NODE_ENV=production
ENV AWS_SECRET_ACCESS_KEY=replace-me
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
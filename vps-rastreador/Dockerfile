# Imagem oficial do Playwright já vem com o Chromium e as libs do sistema.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV PORT=8081
EXPOSE 8081
CMD ["node", "server.js"]

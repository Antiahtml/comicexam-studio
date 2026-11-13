# ComicExam Studio — imagen con Node.js y Chromium (Playwright) ya instalados.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/comicexam.db \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npx prisma generate && npx next build

ENV NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000

# Crea/actualiza la base de datos en el volumen y arranca el servidor.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start -p 3000 -H 0.0.0.0"]

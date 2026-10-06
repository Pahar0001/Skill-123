# Уменьшенная копия Dockerfile KIMota777/sites (10.2026): папки страниц копируются по списку,
# каждая отдельной строкой. Новая napravleniya/ в список не добавлена — на бою 404 при зелёных проверках локально.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY assets ./assets
COPY index.html ./

# Страницы услуг. Каждая — отдельной строкой:
# забытая строка означает 404 на бою при зелёных проверках локально.
COPY razrabotka ./razrabotka
COPY contacts ./contacts

USER node
EXPOSE 4000
CMD ["node", "--no-warnings", "server.js"]

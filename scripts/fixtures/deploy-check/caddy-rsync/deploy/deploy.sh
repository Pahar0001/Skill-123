#!/bin/sh
# выкладка: содержимое папки проекта в корень сайта
rsync -az --delete \
  --exclude 'drafts/' --exclude='*.map' \
  ./ user@example.ru:/var/www/site/

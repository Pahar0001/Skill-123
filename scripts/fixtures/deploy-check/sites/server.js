// Стенд deploy-check: сервер отдаёт папку проекта целиком (как в KIMota777/sites) — локально видно всё.
const path = require('node:path');
const express = require('express');
const app = express();
app.get('/api/sites', (req, res) => res.json([]));
app.use(express.static(__dirname, { extensions: ['html'] }));
app.listen(process.env.PORT || 4000);

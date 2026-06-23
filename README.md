# KPI Plataforma RR3 — Backend

## Deploy no Railway

1. Faça upload deste projeto no Railway
2. Anote a URL gerada (ex: kpi-server-production.up.railway.app)
3. Configure a URL na plataforma HTML

## Endpoints

- `GET  /`              — Health check
- `GET  /api/load`      — Carrega dados atuais
- `POST /api/save`      — Salva dados (corpo: {data, creds, savedBy})
- `POST /api/init`      — Inicializa com dados da plataforma (requer secret)
- `GET  /api/history`   — Lista histórico de salvamentos
- `POST /api/restore/:id` — Restaura snapshot do histórico
- `GET  /plataforma`    — Serve o HTML da plataforma

## Variáveis de ambiente

- `PORT` — porta (padrão: 3000)
- `DB_PATH` — caminho do banco SQLite (padrão: ./kpi.db)
- `INIT_SECRET` — senha para /api/init (padrão: kpi-init-2026)

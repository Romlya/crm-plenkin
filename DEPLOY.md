# Развёртывание CRM ПЛЕНКИН

## Vercel (быстрый старт)

Проект уже подготовлен: `vercel.json` и `api/index.js`.

1. **Storage → Upstash Redis (KV)** → подключить к проекту.
   Появятся переменные `KV_REST_API_URL` и `KV_REST_API_TOKEN`.
2. Redeploy. База будет храниться в KV и переживать cold start.

Без KV приложение работает в демо-режиме: данные пишутся в `/tmp` и могут
обнулиться — в интерфейсе показывается предупреждение. Для реального учёта
подключите KV или используйте VPS.

Проверка serverless-режима локально:

```bash
node tools/vercel-dev.js
```

---

## VPS (рекомендуется для постоянной работы)

CRM — это один Node-процесс с файловой базой: постоянный диск, автобэкапы,
никаких ограничений serverless. Ниже — рабочие варианты.

---

## Вариант 1. VPS + systemd + Caddy

Нужен сервер Ubuntu 22.04+ с публичным IP и доменом (например, `crm.plenkinaokna.ru`).

### 1. Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

### 2. Код и данные

```bash
sudo mkdir -p /opt/plenkin-crm
sudo chown $USER:$USER /opt/plenkin-crm
git clone https://github.com/Romlya/crm-plenkin.git /opt/plenkin-crm
cd /opt/plenkin-crm
```

База создастся в `/opt/plenkin-crm/data` при первом запуске.

### 3. systemd

`/etc/systemd/system/plenkin-crm.service`:

```ini
[Unit]
Description=PLENKIN CRM
After=network.target

[Service]
Type=simple
User=plenkin
WorkingDirectory=/opt/plenkin-crm
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=PORT=7788
Environment=CRM_DATA_DIR=/opt/plenkin-crm/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false plenkin || true
sudo chown -R plenkin:plenkin /opt/plenkin-crm
sudo systemctl daemon-reload
sudo systemctl enable --now plenkin-crm
sudo systemctl status plenkin-crm
```

### 4. HTTPS через Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
crm.plenkinaokna.ru {
    reverse_proxy 127.0.0.1:7788
    encode gzip
}
```

```bash
sudo systemctl reload caddy
```

Сертификат Let's Encrypt выпустится автоматически. Сайт будет доступен по
`https://crm.plenkinaokna.ru`.

### 5. Файрвол

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

Порт 7788 наружу не открывайте — только через Caddy.

### 6. Обновление

```bash
cd /opt/plenkin-crm
git pull
sudo systemctl restart plenkin-crm
```

### 7. Бэкапы

```bash
# ежедневно в 03:00, хранить 30 дней
crontab -e
0 3 * * * tar -czf /var/backups/plenkin-crm-$(date +\%F).tar.gz -C /opt/plenkin-crm data && find /var/backups -name 'plenkin-crm-*.tar.gz' -mtime +30 -delete
```

---

## Вариант 2. Docker

```bash
docker build -t plenkin-crm .
docker run -d --name plenkin-crm \
  -p 7788:7788 \
  -v plenkin-crm-data:/data \
  --restart unless-stopped \
  plenkin-crm
```

Данные лежат в томе `plenkin-crm-data`. Бэкап:

```bash
docker run --rm -v plenkin-crm-data:/data -v "$PWD":/backup alpine \
  tar -czf /backup/crm-$(date +%F).tar.gz -C /data .
```

Перед HTTPS поставьте Caddy/Nginx перед контейнером.

---

## Вариант 3. Домашний компьютер / мини-ПК

1. Установите Node.js 18+.
2. Скопируйте папку с CRM, запустите `start.bat` (Windows) или `node server.js`.
3. Для доступа из интернета — проброс порта на роутере **не рекомендуется**
   (нет HTTPS). Лучше туннель: Cloudflare Tunnel, Tailscale или ngrok.

Доступ по локальной сети (телефон в том же Wi-Fi): адрес печатается в консоли
при запуске, вида `http://192.168.1.35:7788`.

---

## После установки

1. Откройте CRM, задайте пароль.
2. *Настройки → Приём заявок с сайта*: скопируйте адрес и ключ.
3. В сайте (Next.js) в `src/app/api/leads/route.ts` после сохранения заявки вызовите:

```ts
await fetch('https://crm.plenkinaokna.ru/api/public/lead', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.CRM_API_KEY!,
  },
  body: JSON.stringify({ name, phone, email, subject, message, source: 'Сайт' }),
}).catch(() => {});
```

4. Проверьте: отправьте тестовую заявку с сайта — она должна появиться в «Лидах».
5. Настройте бэкапы (см. выше) и раз в неделю скачивайте JSON из настроек.

---

## Проверка работоспособности

```bash
curl -s http://localhost:7788/api/health
node tools/smoke.js http://localhost:7788
```

Второй командой должны пройти 34 проверки.

---

## Частые проблемы

| Симптом | Причина | Решение |
|---|---|---|
| Порт занят | другой процесс | CRM сама возьмёт следующий порт; смотрите лог |
| Сайт не открывается по IP | файрвол | разрешить Node.js / порт в брандмауэре |
| «Требуется вход» после перезапуска | истёк/потерян `secret.key` | не удаляйте `data/secret.key`, он подписывает сессии |
| Забыли пароль | — | `node tools/reset-password.js` при остановленном сервисе |
| Данные пропали | удалён `data/` | восстановите `db.json` из `data/backups/` |

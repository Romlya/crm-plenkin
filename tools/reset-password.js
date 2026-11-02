'use strict';

/**
 * Сброс пароля CRM (если забыли).
 * Остановите сервер (Ctrl+C), затем: node tools/reset-password.js
 * После запуска CRM попросит задать новый пароль.
 */

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'data', 'db.json');

if (!fs.existsSync(file)) {
  console.error('База не найдена:', file);
  console.error('Запустите CRM хотя бы один раз, чтобы создать базу.');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!db.auth) {
  console.log('Пароль не установлен — при запуске CRM попросит его задать.');
  process.exit(0);
}

db.auth = null;
fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
console.log('Пароль сброшен. Запустите CRM и задайте новый пароль.');
console.log('Все данные (лиды, заказы, оплаты) сохранены.');

@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ПЛЕНКИН · CRM
echo.
echo   Запускаю CRM ПЛЕНКИН...
echo.
node server.js --open
echo.
echo   Сервер остановлен. Нажмите любую клавишу, чтобы закрыть окно.
pause >nul

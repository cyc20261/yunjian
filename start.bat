@echo off
chcp 65001 >nul
title 云笺
echo.
echo   正在启动云笺...
echo   启动后请在浏览器打开 http://localhost:8787
echo.
start "" http://localhost:8787
node "%~dp0server.js" 8787

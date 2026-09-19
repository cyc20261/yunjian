@echo off
chcp 65001 >nul
title 云笺 · 个人文稿全能助手
echo.
echo   正在启动云笺...
echo   浏览器将自动打开 http://localhost:8787
echo   （窗口保持开启即可正常使用，关闭窗口 = 退出云笺）
echo.

rem 优先使用包内绿色版 Node（免安装），其次使用系统已装的 Node
if exist "%~dp0tools\node\node.exe" (
  start "" http://localhost:8787
  "%~dp0tools\node\node.exe" "%~dp0server.js" 8787
  goto :end
)

where node >nul 2>&1
if errorlevel 1 (
  echo   [提示] 本包内置的 Node 组件缺失（tools\node\node.exe），
  echo          且电脑上也没有安装 Node.js。
  echo          请到 https://nodejs.org 下载安装 Node.js 后重新运行，
  echo          或联系卖家获取帮助。
  echo.
  pause
  exit /b 1
)
start "" http://localhost:8787
node "%~dp0server.js" 8787

:end
pause

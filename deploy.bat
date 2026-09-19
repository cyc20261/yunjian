@echo off
chcp 65001 >nul
title 云笺 · 部署上线
echo.
echo   正在打包并部署到 Cloudflare Pages ...
echo.

rem 1) 刷新部署目录（排除 31MB 视频内核 / 本地工具 / 学习资料等）
if exist _deploy rmdir /s /q _deploy
mkdir _deploy\vendor\ffmpeg
copy /y index.html app.js style.css video.js README.md _deploy\ >nul
xcopy /e /i /y assets _deploy\assets >nul
xcopy /e /i /y functions _deploy\functions >nul
xcopy /e /i /y vendor\pptxgenjs _deploy\vendor\pptxgenjs >nul
copy /y vendor\ffmpeg\ffmpeg.js _deploy\vendor\ffmpeg\ >nul
copy /y vendor\ffmpeg\814.ffmpeg.js _deploy\vendor\ffmpeg\ >nul
copy /y vendor\ffmpeg\ffmpeg-core.js _deploy\vendor\ffmpeg\ >nul

rem 2) 发布（首次需已登录：npx wrangler login）
npx wrangler pages deploy _deploy --project-name yunjian --branch main
echo.
echo   线上地址：https://yunjian-8ge.pages.dev
echo.
pause

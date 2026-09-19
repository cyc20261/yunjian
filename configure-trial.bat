@echo off
chcp 65001 >nul
title 云笺 · 配置免费体验通道
echo.
echo   ══════════════════════════════════════════
echo    云笺「免费体验 1 次」通道 · Key 配置
echo   ══════════════════════════════════════════
echo.
echo   你的 DeepSeek API Key 将保存在 Cloudflare 的
echo   私密环境变量中，前端页面永远拿不到明文。
echo   （Key 在 platform.deepseek.com/api_keys 获取）
echo.
echo   按提示把 sk-... 粘贴到下方并回车：
echo.
npx wrangler pages secret put DEEPSEEK_KEY --project-name yunjian
echo.
echo   ✅ 配置完成！线上「免费体验 1 次」已激活。
echo      线上地址：https://yunjian-8ge.pages.dev
echo      限制：每台设备 1 次 · 每日全局 100 次 · 单次 700 token
echo.
pause

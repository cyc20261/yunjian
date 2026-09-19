@echo off
chcp 65001 >nul
title 云笺 · 本地语音转写服务 (faster-whisper)
echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║   云笺 · 本地语音转写服务（faster-whisper）     ║
echo   ║   音频只在本机转写，不会上传任何服务器          ║
echo   ╚══════════════════════════════════════════════╝
echo.

python --version >nul 2>&1
if errorlevel 1 (
  echo   [错误] 未检测到 Python，请先安装 Python 3.9 以上版本：
  echo          https://www.python.org/downloads/  （安装时勾选 Add to PATH）
  echo.
  pause
  exit /b 1
)

python -c "import faster_whisper" >nul 2>&1
if errorlevel 1 (
  echo   首次运行：正在安装 faster-whisper（约 100MB，请耐心等待）...
  python -m pip install faster-whisper -i https://pypi.tuna.tsinghua.edu.cn/simple
  if errorlevel 1 (
    echo   [错误] 安装失败，请检查网络后重试，或手动执行：
    echo          python -m pip install faster-whisper
    echo.
    pause
    exit /b 1
  )
)

echo   启动转写服务...（首次转写时会自动下载识别模型，保持本窗口开启即可）
echo.
python "%~dp0whisper_server.py" %*
pause

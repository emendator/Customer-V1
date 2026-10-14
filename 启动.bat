@echo off
chcp 65001 >nul
title 智能客服话术库系统 - 启动中...

echo ========================================
echo   智能客服话术库系统 (Smart CS Assist)
echo ========================================
echo.

:: 设置项目根目录
set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%backend"
set "FRONTEND_DIR=%PROJECT_DIR%frontend"

:: 检测 Python 位置
echo [1/5] 检测 Python 环境...
set "PYTHON_CMD=python"
where python >nul 2>&1
if %errorlevel% equ 0 goto python_found

echo   [信息] 未在系统 PATH 中找到 python，正在搜索常见安装位置...
set "PYTHON_CMD="
for %%p in (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "%ProgramFiles%\Python313\python.exe"
    "%ProgramFiles%\Python312\python.exe"
    "%ProgramFiles%\Python311\python.exe"
    "%ProgramFiles%\Python310\python.exe"
    "%ProgramFiles(x86)%\Python313\python.exe"
    "%ProgramFiles(x86)%\Python312\python.exe"
    "%ProgramFiles(x86)%\Python311\python.exe"
    "%ProgramFiles(x86)%\Python310\python.exe"
) do if exist %%p set "PYTHON_CMD=%%p" & goto python_found

:: 尝试 Python 启动器 (py)
where py >nul 2>&1
if %errorlevel% equ 0 set "PYTHON_CMD=py -3" & goto python_found

echo   [错误] 未找到 Python，请先安装 Python 3.10+
pause
exit /b 1

:python_found
echo   [OK] Python 已就绪: %PYTHON_CMD%

:: 检测 Node.js
echo [2/5] 检测 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [错误] 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)
echo   [OK] Node.js 已就绪

:: 安装后端依赖
echo [3/5] 检查后端依赖...
if not exist "%BACKEND_DIR%\.env" (
    echo   创建 .env 配置文件...
    copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
)
cd /d "%BACKEND_DIR%"
:: 优先使用虚拟环境的 Python（项目根目录下的 .venv）
set "VENV_PYTHON=%PROJECT_DIR%.venv\Scripts\python.exe"
if exist "%VENV_PYTHON%" (
    set "BACKEND_PYTHON=%VENV_PYTHON%"
) else (
    set "BACKEND_PYTHON=%PYTHON_CMD%"
)
%BACKEND_PYTHON% -c "import fastapi" >nul 2>&1
if %errorlevel% neq 0 (
    echo   正在安装后端依赖包...
    %BACKEND_PYTHON% -m pip install -r requirements.txt -q
    if %errorlevel% neq 0 (
        echo   [警告] 部分依赖安装失败，尝试继续...
    )
)
echo   [OK] 后端依赖已就绪

:: 初始化数据库
echo   初始化数据库...
%BACKEND_PYTHON% init_db.py
if %errorlevel% neq 0 (
    echo   [警告] 数据库初始化可能有问题，尝试继续...
)

:: 安装前端依赖
echo [4/5] 检查前端依赖...
cd /d "%FRONTEND_DIR%"
if not exist "node_modules" (
    echo   正在安装前端依赖包（首次运行可能需要几分钟）...
    call npm install
    if %errorlevel% neq 0 (
        echo   [错误] 前端依赖安装失败
        pause
        exit /b 1
    )
)
echo   [OK] 前端依赖已就绪

:: 启动服务
echo [5/5] 启动服务...
echo.

:: 启动后端 (新窗口，使用 --reload 在崩溃后自动重启)
echo   启动后端服务 (端口 8002)...
set "PYTHONPATH=%BACKEND_DIR%"
set "SQLITE_TIMEOUT=30"
start "智能客服-后端" /D "%BACKEND_DIR%" "%BACKEND_PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload

:: 等待后端就绪（最多等30秒，每秒检查一次）
echo   等待后端就绪...
set "BACKEND_READY="
for /l %%i in (1,1,30) do (
    timeout /t 1 /nobreak >nul
    curl -s http://localhost:8002/api/health >nul 2>&1
    if not errorlevel 1 (
        set "BACKEND_READY=1"
        echo   [OK] 后端已就绪（第%%i秒）
        goto backend_ready
    )
)
:backend_ready
if not defined BACKEND_READY (
    echo   [警告] 后端启动超时，继续尝试启动前端...
)

:: 启动前端 (新窗口)
echo   启动前端服务 (端口 5175)...
start "智能客服-前端" /D "%FRONTEND_DIR%" cmd /c "npm run dev"

:: 等待前端就绪（最多等30秒）
echo   等待前端就绪...
for /l %%i in (1,1,30) do (
    timeout /t 1 /nobreak >nul
    curl -s http://localhost:5175 >nul 2>&1
    if not errorlevel 1 (
        echo   [OK] 前端已就绪（第%%i秒）
        goto frontend_ready
    )
)
:frontend_ready

:: 打开浏览器
echo   正在打开浏览器...
start "" http://localhost:5175

echo.
echo ========================================
echo   ✅ 系统启动完成！
echo.
echo   前端地址: http://localhost:5175
echo   后端地址: http://localhost:8002
echo   API 文档: http://localhost:8002/docs
echo.
echo   按任意键关闭此窗口（不影响服务运行）
echo ========================================
pause

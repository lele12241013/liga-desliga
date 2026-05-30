@echo off
chcp 65001 >nul
title Liga/Desliga Notebook
cd /d "%~dp0"

echo.
echo =============================================
echo   Liga/Desliga Notebook - Iniciando...
echo =============================================
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo Execute primeiro o arquivo:  instalar-e-iniciar.ps1
    echo Ou baixe o Node.js em:       https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Verificar se dependencias estao instaladas
if not exist "node_modules" (
    echo Instalando dependencias pela primeira vez...
    call npm install
    echo.
)

:: Mostrar IPs disponiveis
echo Enderecos para acesso na rede:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set ip=%%a
    setlocal enabledelayedexpansion
    set ip=!ip: =!
    echo   http://!ip!:3000
    endlocal
)
echo.

:: Iniciar servidor
echo Servidor iniciado! Pressione Ctrl+C para parar.
echo.
node server.js
pause

@echo off
chcp 65001 >nul
title 원시섬 실험 서버
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 가 없어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  start https://nodejs.org/ko
  pause
  exit /b
)
start "" http://localhost:8080
node server.js
pause

@echo off
cd /d "%~dp0"
set "PATH=%~dp0node;%PATH%"
echo Starting BrainRot Video Editor...
call npm run dev

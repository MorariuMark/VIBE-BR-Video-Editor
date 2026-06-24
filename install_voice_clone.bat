@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo ===================================================
echo   Installing Voice Cloning Environment (Qwen3-TTS)
echo ===================================================
echo.
echo Installing only inside the project folder...
echo.

:: 1. Create Virtual Environment if not exists
if not exist ".venv" (
    echo [1/4] Creating virtual environment venv...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment. Please check your Python installation.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Virtual environment venv already exists.
)

:: 2. Activate Virtual Environment
echo [2/4] Activating virtual environment...
call .venv\Scripts\activate

:: 3. Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip

:: 4. Install CUDA-enabled PyTorch & Torchaudio
echo [3/4] Installing PyTorch & Torchaudio with GPU (CUDA 12.1) support...
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
if errorlevel 1 (
    echo [ERROR] Failed to install PyTorch/Torchaudio. Retrying with default index...
    pip install torch torchaudio
)

:: 5. Install Qwen3-TTS and Flask Server requirements
echo [4/4] Installing qwen-tts, flask, soundfile, and dependencies...
pip install -U qwen-tts
pip install flask soundfile numpy requests
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

:: 6. Setup local folders
if not exist "presets" mkdir presets
if not exist "assets\default_voices" mkdir assets\default_voices
if not exist ".hf_cache" mkdir .hf_cache

echo.
echo ===================================================
echo   Installation Completed Successfully!
echo ===================================================
echo   Virtual Environment: .venv
echo   HF cache location:   .hf_cache (fully local)
echo ===================================================
echo.
pause

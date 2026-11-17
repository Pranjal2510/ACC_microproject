@echo off
echo ========================================================
echo   Starting ACC Microproject (Go Backend + Frontend)
echo ========================================================

:: Check Go installation
where go >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 'go' command was not found. Please install Go or run on a PC with Go installed.
    pause
    exit /b 1
)

:: 1. Generate keys if missing
if not exist "tmp\keys\public.pem" (
    echo [1/4] Generating RSA keys...
    go run ./scripts/create_test_token
) else (
    echo [1/4] Keys already present in tmp\keys\
)

:: 2. Start stub service on port 9001
echo [2/4] Starting backend stub service (port 9001)...
start "Backend Stub Service (:9001)" go run ./stubs -port 9001

:: 3. Start proxy on port 8080
echo [3/4] Starting Go proxy / API gateway (:8080)...
start "Go API Gateway (:8080)" go run ./cmd/proxy -port 8080

:: 4. Launch the dashboard
echo [4/4] Opening frontend dashboard...
start "" front-end\index.html

echo.
echo ========================================================
echo   All services have been started!
echo   - Backend Stub: http://localhost:9001
echo   - Go Gateway:   http://localhost:8080
echo   - Frontend:     Opened in default browser
echo ========================================================

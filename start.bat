@echo off
echo =====================================
echo     INICIANDO SISTEMA
echo =====================================
echo.

echo 1. Iniciando DataHub...
start "DataHub" cmd /k "cd /d C:\PROGRAMAS\Supervisorio && venv\Scripts\python.exe datahub.py"

echo    Aguardando 8 segundos...
timeout /t 8 /nobreak > nul

echo.
echo 2. Iniciando Supervisorio...
start "Supervisorio" cmd /k "cd /d C:\PROGRAMAS\Supervisorio && venv\Scripts\python.exe app.py"

echo.
echo =====================================
echo     SISTEMA INICIADO!
echo =====================================
echo.
echo DataHub:      http://localhost:8000
echo Supervisorio: http://localhost:5000
echo.
pause



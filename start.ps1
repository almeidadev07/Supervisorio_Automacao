# start.ps1
# Script simplificado para iniciar o supervisorio com deteccao automatica

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "SUPERVISORIO - INICIO AUTOMATICO" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# Simplesmente chama o script completo sem parametros (deteccao automatica)
.\start_supervisorio_with_nodes7.ps1

# Se quiser especificar manualmente:
# .\start_supervisorio_with_nodes7.ps1 -Machine "700CX" -PlcIp "100.70.0.10"


# app/services/plc_controller.py
# Controlador PLC Principal - Usa o sistema otimizado por padrão

from .plc_controller_final import FinalPLCController

# Por padrão, usa o controlador final otimizado
PLCController = FinalPLCController

# Para compatibilidade, mantém o nome antigo
class PLCController(FinalPLCController):
    """Controlador PLC Principal - Sistema Otimizado"""
    pass

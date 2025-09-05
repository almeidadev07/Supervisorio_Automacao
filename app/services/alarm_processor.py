#!/usr/bin/env python3
"""
Sistema de Processamento de Alarmes
Converte dados WORD do PLC em alarmes individuais com descrições
"""

import json
import os
from typing import Dict, List, Any, Optional
from datetime import datetime

class AlarmProcessor:
    def __init__(self, comm_map_path: str = "config/comm_map"):
        self.comm_map_path = comm_map_path
        self.alarm_descriptions = {}
        self._load_alarm_descriptions()
    
    def _load_alarm_descriptions(self):
        """Carrega as descrições dos alarmes dos arquivos gerados"""
        descriptions_path = "alarmes"
        if not os.path.exists(descriptions_path):
            return
        
        for filename in os.listdir(descriptions_path):
            if filename.endswith("_descricoes.txt"):
                # Extrai o nome base do alarme
                base_name = filename.replace("_descricoes.txt", "")
                
                # Lê o arquivo de descrições
                file_path = os.path.join(descriptions_path, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Extrai as descrições dos comentários
                    descriptions = {}
                    for line in content.split('\n'):
                        if line.strip().startswith('// [') and ']' in line and '=' in line:
                            # Formato: // [ 0] VARIAVEL[0] = DESCRICAO
                            try:
                                # Extrai o índice
                                start_idx = line.find('[') + 1
                                end_idx = line.find(']')
                                index = int(line[start_idx:end_idx].strip())
                                
                                # Extrai a descrição
                                desc_start = line.find('=') + 1
                                description = line[desc_start:].strip()
                                
                                descriptions[index] = description
                            except (ValueError, IndexError):
                                continue
                    
                    if descriptions:
                        self.alarm_descriptions[base_name] = descriptions
                        print(f"[ALARM] Carregadas {len(descriptions)} descrições para {base_name}")
                
                except Exception as e:
                    print(f"[ALARM] Erro ao carregar descrições de {filename}: {e}")
    
    def process_alarm_data(self, plc_data: Dict[str, Any], machine: str) -> List[Dict[str, Any]]:
        """
        Processa dados do PLC e retorna lista de alarmes ativos
        
        Args:
            plc_data: Dados recebidos do PLC via SocketIO
            machine: Nome da máquina (200CX, 400CX, 700CX)
        
        Returns:
            Lista de alarmes ativos com descrições
        """
        active_alarms = []
        
        # Lista de variáveis WORD que são alarmes
        alarm_variables = [
            "XLCLASS_DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS",
            "XLCLASS_DB04_AUXILIAR_EMERGENCIA_COMANDO_01",
            "XLCLASS_DB04_AUXILIAR_EMERGENCIA_COMANDO_02",
            "XLCLASS_DB01_PRINCIPAL_EMERG_PAINEL_PRINCIPAL",
            "XLCLASS_DB01_PRINCIPAL_EMERG_LAVADORA",
            "XLCLASS_DB01_PRINCIPAL_EMERG_EST_INTELIGENTES",
            "XLCLASS_DB01_PRINCIPAL_EMERG_ALIMENTADOR",
            "XLCLASS_DB01_PRINCIPAL_EMERG_OVOSCOPIA",
            "XLCLASS_DB01_PRINCIPAL_EMERG_PRESELECIONADOR"
        ]
        
        # Adiciona alarmes de embaladoras (EMB01 a EMB24)
        for i in range(1, 25):
            alarm_variables.append(f"XLCLASS_DB01_PRINCIPAL_EMERG_EMB{i:02d}")
        
        # Processa cada variável de alarme
        for var_name in alarm_variables:
            if var_name in plc_data:
                word_value = plc_data[var_name]
                
                # Converte WORD para bits individuais
                if isinstance(word_value, (int, float)) and word_value > 0:
                    # Extrai o nome base para buscar descrições
                    base_name = var_name.replace("XLCLASS_", "").replace("_WORD", "")
                    
                    # Processa cada bit (0-15)
                    for bit_index in range(16):
                        # Verifica se o bit está ativo
                        if self._is_bit_set(word_value, bit_index):
                            alarm_info = self._create_alarm_info(
                                var_name, bit_index, base_name, machine
                            )
                            if alarm_info:
                                active_alarms.append(alarm_info)
        
        return active_alarms
    
    def _is_bit_set(self, value: int, bit_index: int) -> bool:
        """Verifica se um bit específico está ativo"""
        try:
            return bool((int(value) >> bit_index) & 1)
        except (ValueError, TypeError):
            return False
    
    def _create_alarm_info(self, var_name: str, bit_index: int, base_name: str, machine: str) -> Optional[Dict[str, Any]]:
        """Cria informações do alarme com descrição"""
        try:
            # Busca a descrição do alarme
            description = self._get_alarm_description(base_name, bit_index)
            
            # Determina a prioridade baseada no tipo de alarme
            priority = self._determine_priority(var_name, bit_index)
            
            # Cria o ID único do alarme
            alarm_id = f"{var_name}_bit_{bit_index}"
            
            return {
                "id": alarm_id,
                "var_name": var_name,
                "bit_index": bit_index,
                "description": description,
                "priority": priority,
                "machine": machine,
                "timestamp": datetime.now().strftime("%H:%M"),
                "active": True
            }
        
        except Exception as e:
            print(f"[ALARM] Erro ao criar alarme {var_name}[{bit_index}]: {e}")
            return None
    
    def _get_alarm_description(self, base_name: str, bit_index: int) -> str:
        """Obtém a descrição do alarme"""
        if base_name in self.alarm_descriptions:
            descriptions = self.alarm_descriptions[base_name]
            if bit_index in descriptions:
                return descriptions[bit_index]
        
        # Fallback para descrição genérica
        return f"{base_name} - Bit {bit_index}"
    
    def _determine_priority(self, var_name: str, bit_index: int) -> str:
        """Determina a prioridade do alarme baseada no tipo"""
        var_lower = var_name.lower()
        
        if "emerg" in var_lower or "emergencia" in var_lower:
            return "emergency"
        elif "alarmes_alto" in var_lower:
            return "emergency"
        elif "auxiliar" in var_lower:
            return "emergency"
        elif "emb" in var_lower:
            return "process"
        elif "lavadora" in var_lower or "esteira" in var_lower:
            return "process"
        elif "alimentador" in var_lower or "ovoscopia" in var_lower:
            return "process"
        else:
            return "hardware"
    
    def get_alarm_summary(self, active_alarms: List[Dict[str, Any]]) -> Dict[str, int]:
        """Retorna resumo dos alarmes por prioridade"""
        summary = {
            "emergency": 0,
            "drives": 0,
            "thermal": 0,
            "hardware": 0,
            "process": 0,
            "total": len(active_alarms)
        }
        
        for alarm in active_alarms:
            priority = alarm.get("priority", "hardware")
            if priority in summary:
                summary[priority] += 1
        
        return summary

# Instância global do processador
alarm_processor = AlarmProcessor()

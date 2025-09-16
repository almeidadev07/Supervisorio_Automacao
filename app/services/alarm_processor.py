#!/usr/bin/env python3
"""
Sistema de Processamento de Alarmes
Converte dados WORD do PLC em alarmes individuais com descrições
"""

import json
import os
from typing import Dict, List, Any, Optional
from collections import OrderedDict
from datetime import datetime

class AlarmProcessor:
    def __init__(self, comm_map_path: str = "config/comm_map"):
        self.comm_map_path = comm_map_path
        self.alarm_descriptions = {}
        self.priority_overrides: Dict[str, Dict[int, str]] = {}
        self.type_overrides: Dict[str, Dict[int, str]] = {}
        self._type_overrides_path = os.path.join("alarmes", "tipos_overrides.json")
        self._type_overrides_mtime: Optional[float] = None
        self._load_alarm_descriptions()
        self._load_priority_overrides()
        self._load_type_overrides(write_back=True)
    
    def _load_alarm_descriptions(self):
        """Carrega as descrições dos alarmes dos arquivos gerados.
        Suporta tanto um arquivo por alarme quanto arquivos consolidados
        contendo múltiplas bases (detectando o nome da base por linha).
        """
        descriptions_path = "alarmes"
        if not os.path.exists(descriptions_path):
            return

        for filename in os.listdir(descriptions_path):
            if not filename.endswith("_descricoes.txt"):
                continue

            file_path = os.path.join(descriptions_path, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Dicionário temporário: base_name -> { index: description }
                bases: Dict[str, Dict[int, str]] = {}

                for raw_line in content.split('\n'):
                    line = raw_line.strip()
                    if not (line.startswith('// [') and ']' in line and '=' in line):
                        continue

                    try:
                        # Índice entre colchetes // [ xx]
                        idx_start = line.find('[') + 1
                        idx_end = line.find(']')
                        index = int(line[idx_start:idx_end].strip())

                        # Após o marcador, esperamos algo como SOME_BOOL[xx] = DESCR
                        after_marker = line[idx_end+1:].strip()

                        # Extrai o nome do array BOOL (até o primeiro '[')
                        bool_name_end = after_marker.find('[')
                        bool_name = after_marker[:bool_name_end].strip()
                        base_name = bool_name.replace('_BOOL', '')

                        # Descrição após '='
                        desc_start = line.find('=') + 1
                        description = line[desc_start:].strip()

                        if base_name not in bases:
                            bases[base_name] = {}
                        bases[base_name][index] = description
                    except Exception:
                        continue

                # Caso não haja marcadores por-base, assume base pelo filename (modo antigo)
                if not bases:
                    base_name = filename.replace("_descricoes.txt", "")
                    descriptions: Dict[int, str] = {}
                    for line in content.split('\n'):
                        if line.strip().startswith('// [') and ']' in line and '=' in line:
                            try:
                                start_idx = line.find('[') + 1
                                end_idx = line.find(']')
                                index = int(line[start_idx:end_idx].strip())
                                desc_start = line.find('=') + 1
                                description = line[desc_start:].strip()
                                descriptions[index] = description
                            except (ValueError, IndexError):
                                continue
                    if descriptions:
                        bases[base_name] = descriptions

                # Persiste as bases encontradas
                for base, mapping in bases.items():
                    if mapping:
                        self.alarm_descriptions[base] = mapping
                        print(f"[ALARM] Carregadas {len(mapping)} descrições para {base}")

            except Exception as e:
                print(f"[ALARM] Erro ao carregar descrições de {filename}: {e}")

    def _load_priority_overrides(self):
        """Carrega arquivo opcional de overrides de prioridade por bit.
        Formato esperado (JSON): { "DB04_PRINCIPAL_EMERG_PAINEL_PRINCIPAL": { "1": "nr12", ... } }
        """
        overrides_path = os.path.join("alarmes", "prioridades_overrides.json")
        if not os.path.exists(overrides_path):
            return
        try:
            with open(overrides_path, "r", encoding="utf-8") as f:
                raw: Dict[str, Dict[str, str]] = json.load(f)
            parsed: Dict[str, Dict[int, str]] = {}
            for base, mapping in raw.items():
                parsed[base] = {}
                for k, v in mapping.items():
                    try:
                        parsed[base][int(k)] = v.lower()
                    except ValueError:
                        continue
            self.priority_overrides = parsed
            print(f"[ALARM] Overrides de prioridade carregados: {len(self.priority_overrides)} bases")
        except Exception as e:
            print(f"[ALARM] Falha ao ler prioridades_overrides.json: {e}")

    def _load_type_overrides(self, write_back: bool = False):
        """Carrega arquivo opcional de overrides de type por bit.
        Formato esperado (JSON): { "DB04_PRINCIPAL_EMERG_PAINEL_PRINCIPAL": { "1": "nr12", ... } }
        """
        overrides_path = self._type_overrides_path
        existing: Dict[str, Dict[str, str]] = {}
        if os.path.exists(overrides_path):
            try:
                with open(overrides_path, "r", encoding="utf-8") as f:
                    existing = json.load(f) or {}
            except Exception as e:
                print(f"[ALARM] Falha ao ler tipos_overrides.json (será regenerado/mesclado): {e}")

        if write_back:
            # Constrói base padrão a partir das descrições carregadas (apenas para preencher faltantes)
            generated: Dict[str, Dict[str, str]] = {}
            for base, indexes in self.alarm_descriptions.items():
                gen_map: Dict[str, str] = {}
                for idx, desc in indexes.items():
                    gen_map[str(idx)] = self._classify_type_from_description(desc)
                if gen_map:
                    generated[base] = gen_map

            # Mescla: existente tem precedência; completa faltantes com gerado
            merged: Dict[str, Dict[str, str]] = {}
            all_bases = set(generated.keys()) | set(existing.keys())
            for base in all_bases:
                merged[base] = {}
                if base in generated:
                    merged[base].update(generated[base])
                if base in existing:
                    # sobrescreve com explicitamente definido pelo usuário
                    merged[base].update(existing[base])
        else:
            # Apenas usa o existente, sem gerar/mesclar
            merged = existing

        # Atualiza em memória como mapa int->str
        parsed: Dict[str, Dict[int, str]] = {}
        for base, mapping in merged.items():
            parsed[base] = {}
            for k, v in mapping.items():
                try:
                    parsed[base][int(k)] = v
                except ValueError:
                    continue
        self.type_overrides = parsed
        print(f"[ALARM] Types por índice disponíveis: {len(self.type_overrides)} bases")

        if write_back:
            # Persiste arquivo mesclado/gerado para edição manual futura (ordenado)
            try:
                os.makedirs(os.path.dirname(overrides_path), exist_ok=True)
                # Converte de volta para chaves string para JSON
                # Ordena bases priorizando grupos fixos e EMB01..EMB24 em ordem numérica
                def _emb_number(b: str) -> Optional[int]:
                    try:
                        if "_EMB" in b:
                            tail = b.split("_EMB", 1)[1]
                            num = ""
                            for ch in tail:
                                if ch.isdigit():
                                    num += ch
                                else:
                                    break
                            return int(num) if num else None
                        return None
                    except Exception:
                        return None

                fixed_groups = [
                    "DB04_PRINCIPAL_EMERG_PAINEL_PRINCIPAL",
                    "DB04_PRINCIPAL_EMERG_LAVADORA",
                    "DB04_PRINCIPAL_EMERG_EST_INTELIGENTES",
                    "DB04_PRINCIPAL_EMERG_ALIMENTADOR",
                    "DB04_PRINCIPAL_EMERG_OVOSCOPIA",
                    "DB04_PRINCIPAL_EMERG_PRESELECIONADOR",
                ]

                all_bases = list(self.type_overrides.keys())
                fixed_in_order = [b for b in fixed_groups if b in self.type_overrides]
                emb_bases = [b for b in all_bases if _emb_number(b) is not None]
                emb_bases.sort(key=lambda b: _emb_number(b) or 0)
                remaining_bases = [b for b in all_bases if b not in fixed_in_order and b not in emb_bases]
                # Coloca DB1 depois dos DB04
                db1_bases = [b for b in remaining_bases if b.startswith("DB1_") or b.startswith("DB01_")]
                other_bases = [b for b in remaining_bases if b not in db1_bases]
                other_bases.sort()
                db1_bases.sort()

                ordered_bases = fixed_in_order + emb_bases + other_bases + db1_bases

                ordered_to_write: "OrderedDict[str, Dict[str, str]]" = OrderedDict()
                for base in ordered_bases:
                    mapping = self.type_overrides[base]
                    ordered_to_write[base] = {str(k): mapping[k] for k in sorted(mapping.keys())}

                with open(overrides_path, "w", encoding="utf-8") as f:
                    json.dump(ordered_to_write, f, ensure_ascii=False, indent=2)
                try:
                    self._type_overrides_mtime = os.path.getmtime(overrides_path)
                except Exception:
                    self._type_overrides_mtime = None
            except Exception as e:
                print(f"[ALARM] Não foi possível gravar tipos_overrides.json: {e}")

    def _classify_type_from_description(self, description: str) -> str:
        """Classifica um tipo funcional a partir da descrição do índice.
        Não utiliza nome da tag. Pode ser ajustado conforme necessidade.
        """
        text = (description or "").lower()
        if "nr12" in text:
            return "nr12"
        if "emerg" in text or "emergência" in text or "emergencia" in text:
            return "emergency"
        if "drive" in text or "inversor" in text:
            return "drives"
        if "thermal" in text or "térmico" in text or "termico" in text or "temperatura" in text:
            return "thermal"
        if (
            "lavadora" in text
            or "esteira" in text
            or "alimentador" in text
            or "ovoscopia" in text
            or "preselec" in text
            or "emb" in text
        ):
            return "process"
        return "hardware"
    
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
            # Principais alarmes (DB1)
            "XLCLASS_DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS",
            # Auxiliares (DB04)
            "XLCLASS_DB04_AUXILIAR_EMERGENCIA_COMANDO_01",
            "XLCLASS_DB04_AUXILIAR_EMERGENCIA_COMANDO_02",
            # Emergências principais (DB04)
            "XLCLASS_DB04_PRINCIPAL_EMERG_PAINEL_PRINCIPAL",
            "XLCLASS_DB04_PRINCIPAL_EMERG_LAVADORA",
            "XLCLASS_DB04_PRINCIPAL_EMERG_EST_INTELIGENTES",
            "XLCLASS_DB04_PRINCIPAL_EMERG_ALIMENTADOR",
            "XLCLASS_DB04_PRINCIPAL_EMERG_OVOSCOPIA",
            "XLCLASS_DB04_PRINCIPAL_EMERG_PRESELECIONADOR",
            # Compatibilidade: considere também DB01 caso telemetria use outro DB
            "XLCLASS_DB01_PRINCIPAL_EMERG_PAINEL_PRINCIPAL",
            "XLCLASS_DB01_PRINCIPAL_EMERG_LAVADORA",
            "XLCLASS_DB01_PRINCIPAL_EMERG_EST_INTELIGENTES",
            "XLCLASS_DB01_PRINCIPAL_EMERG_ALIMENTADOR",
            "XLCLASS_DB01_PRINCIPAL_EMERG_OVOSCOPIA",
            "XLCLASS_DB01_PRINCIPAL_EMERG_PRESELECIONADOR",
        ]
        
        # Adiciona alarmes de embaladoras (EMB01 a EMB24)
        for i in range(1, 25):
            # DB04 (preferencial)
            alarm_variables.append(f"XLCLASS_DB04_PRINCIPAL_EMERG_EMB{i:02d}")
            # DB01 (compatibilidade)
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
            
            # Determina prioridade (com override por bit se configurado)
            priority = self._get_priority_with_overrides(base_name, bit_index)
            if not priority:
                # Classifica pela descrição do índice (não pelo nome da tag)
                priority = self._determine_priority_from_description(description)

            # Determina type independente (não depende do nome da tag nem descrição se override existir)
            alarm_type = self._get_type_with_overrides(base_name, bit_index)
            if not alarm_type:
                # Se não houver type específico, usa a mesma lógica de prioridade como fallback
                alarm_type = priority

            # Mantém prioridade alinhada ao type para refletir na UI/contadores
            priority = alarm_type
            
            # Cria o ID único do alarme
            alarm_id = f"{var_name}_bit_{bit_index}"
            
            # Log simples para depuração
            try:
                print(f"[ALARM] base={base_name} bit={bit_index} type={alarm_type} priority={priority}")
            except Exception:
                pass

            return {
                "id": alarm_id,
                "var_name": var_name,
                "bit_index": bit_index,
                "base_name": base_name,
                "description": description,
                "priority": priority,
                "type": alarm_type,
                "machine": machine,
                "timestamp": datetime.now().strftime("%H:%M"),
                "active": True
            }
        
        except Exception as e:
            print(f"[ALARM] Erro ao criar alarme {var_name}[{bit_index}]: {e}")
            return None

    def _get_priority_with_overrides(self, base_name: str, bit_index: int) -> Optional[str]:
        """Retorna prioridade via overrides JSON, considerando DB01/DB04 equivalência."""
        # Tentativa direta
        mapping = self.priority_overrides.get(base_name)
        if mapping and bit_index in mapping:
            return mapping[bit_index]
        # Tentativa com DB swap
        candidates = []
        if base_name.startswith("DB01_"):
            candidates.append(base_name.replace("DB01_", "DB04_", 1))
        if base_name.startswith("DB04_"):
            candidates.append(base_name.replace("DB04_", "DB01_", 1))
        for cand in candidates:
            mapping = self.priority_overrides.get(cand)
            if mapping and bit_index in mapping:
                return mapping[bit_index]
        return None

    def _get_type_with_overrides(self, base_name: str, bit_index: int) -> Optional[str]:
        """Retorna type via overrides JSON, considerando DB01/DB04 equivalência."""
        # Recarrega dinamicamente se o arquivo mudou
        self._maybe_reload_type_overrides()
        mapping = self.type_overrides.get(base_name)
        if mapping and bit_index in mapping:
            return mapping[bit_index]
        candidates = []
        if base_name.startswith("DB01_"):
            candidates.append(base_name.replace("DB01_", "DB04_", 1))
        if base_name.startswith("DB04_"):
            candidates.append(base_name.replace("DB04_", "DB01_", 1))
        for cand in candidates:
            mapping = self.type_overrides.get(cand)
            if mapping and bit_index in mapping:
                return mapping[bit_index]
        return None

    def _maybe_reload_type_overrides(self) -> None:
        """Recarrega tipos_overrides.json se houver alteração no arquivo."""
        try:
            if not self._type_overrides_path:
                return
            if not os.path.exists(self._type_overrides_path):
                return
            current_mtime = os.path.getmtime(self._type_overrides_path)
            if self._type_overrides_mtime is None or current_mtime > self._type_overrides_mtime:
                # Recarrega sem sobrescrever arquivo (respeita edição manual)
                self._load_type_overrides(write_back=False)
        except Exception:
            pass
    
    def _get_alarm_description(self, base_name: str, bit_index: int) -> str:
        """Obtém a descrição do alarme"""
        # Tenta direto
        if base_name in self.alarm_descriptions:
            descriptions = self.alarm_descriptions[base_name]
            if bit_index in descriptions:
                return descriptions[bit_index]
        # Tenta normalizações entre DB01 e DB04
        normalized_candidates = []
        if base_name.startswith("DB01_"):
            normalized_candidates.append(base_name.replace("DB01_", "DB04_", 1))
        if base_name.startswith("DB04_"):
            normalized_candidates.append(base_name.replace("DB04_", "DB01_", 1))
        for candidate in normalized_candidates:
            if candidate in self.alarm_descriptions and bit_index in self.alarm_descriptions[candidate]:
                return self.alarm_descriptions[candidate][bit_index]
        
        # Fallback para descrição genérica
        return f"{base_name} - Bit {bit_index}"
    
    def _determine_priority_from_description(self, description: str) -> str:
        """Determina a prioridade baseada no texto da descrição do índice."""
        text = (description or "").lower()
        
        if "nr12" in text:
            return "nr12"
        if "emerg" in text or "emergência" in text or "emergencia" in text:
            return "emergency"
        if "drive" in text or "inversor" in text:
            return "drives"
        if "thermal" in text or "térmico" in text or "termico" in text or "temperatura" in text:
            return "thermal"
        if (
            "lavadora" in text
            or "esteira" in text
            or "alimentador" in text
            or "ovoscopia" in text
            or "preselec" in text
            or "emb" in text
        ):
            return "process"
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

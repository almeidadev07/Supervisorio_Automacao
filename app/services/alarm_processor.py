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
        self._history_path = os.path.join("alarmes", "alarm_history.json")
        self._last_alarm_state: Dict[str, Any] = {}
        self._recent_events: Dict[str, float] = {}  # Cache de eventos recentes para evitar duplicação
        self._history_lock = False  # Lock simples para evitar processamento simultâneo
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

        # Modo de teste: processa apenas DB10 (habilita criando o arquivo alarmes/TEST_DB10_ONLY.flag
        # ou definindo a env var ALARM_TEST_DB10_ONLY=1). Útil para depuração em campo.
        # Retorna ao comportamento normal: usa flag/arquivo opcional para modo DB10-only
        try:
            test_db10_only = (
                os.environ.get('ALARM_TEST_DB10_ONLY') == '1' or
                os.path.exists(os.path.join('alarmes', 'TEST_DB10_ONLY.flag'))
            )
        except Exception:
            test_db10_only = False
        
        # Lista base de variáveis WORD que são alarmes (conhecidas)
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

        # Se modo de teste DB10 estiver ativo, limita somente à DB10
        if test_db10_only:
            alarm_variables = ["XLCLASS_DB10_PARTIDA_DIRETA_ALARMES_TERMICOS"]
            print("[ALARM TEST] Modo DB10-only ativo: processando apenas XLCLASS_DB10_PARTIDA_DIRETA_ALARMES_TERMICOS")
        

        # Inclusões específicas faltantes identificadas em comm_map (DB06, DB10 etc.)
        additional_known_alarm_vars = [
            # DB06 - Janelas fora de posição
            "XLCLASS_DB06_AUX_INDEX_ALARME_JANELA_FORA_POS_VISION_EMB09",
            "XLCLASS_DB06_AUX_INDEX_ALARME_JANELA_FORA_POS_EMB10_CAP_FINAL",
            # DB10 - Térmicos
            "XLCLASS_DB10_PARTIDA_DIRETA_ALARMES_TERMICOS",
            # DB104 - Estados de dispositivos (erros/desc)
            "XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_XLCLASS_EMB14",
            "XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_EMB15_EMB30",
            "XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_LAVADORA_EST_INTEL",
            "XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_XLCLASS_EMB14",
            "XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_EMB15_EMB30",
            "XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_LAVADORA_EST_INTEL",
            "XLCLASS_DB104_INFO_DISPOSITIVOS_DRIVE_ERRO",
            # Linhas auxiliares/alarmes modulares
            "XLCLASS_DB901_ESTEIRA_INLINE_ALARMES",
            "XLCLASS_DB911_DOSIFICADORA_ALARMES",
            "XLCLASS_DB921_ESCOVAS_ALARMES",
        ]
        if not test_db10_only:
            for v in additional_known_alarm_vars:
                if v not in alarm_variables:
                    alarm_variables.append(v)
        
        # Adiciona alarmes de embaladoras (EMB01 a EMB24)
        if not test_db10_only:
            for i in range(1, 25):
                # DB04 (preferencial)
                alarm_variables.append(f"XLCLASS_DB04_PRINCIPAL_EMERG_EMB{i:02d}")
                # DB01 (compatibilidade)
                alarm_variables.append(f"XLCLASS_DB01_PRINCIPAL_EMERG_EMB{i:02d}")
        
        # Descoberta automática: considera quaisquer variáveis do plc_data com
        # indicativos de alarme/ emergência no nome, para cobrir novas bases
        if not test_db10_only:
            try:
                alarm_name_markers = ("ALARM", "ALARME", "ALARMES", "EMERG")
                for key in plc_data.keys():
                    if not isinstance(key, str):
                        continue
                    upper_key = key.upper()
                    if upper_key.startswith("XLCLASS_") and any(m in upper_key for m in alarm_name_markers):
                        if key not in alarm_variables:
                            alarm_variables.append(key)
            except Exception:
                # Em caso de qualquer problema, segue com a lista já montada
                pass

        # Log temporário para debug de DB10 e DB104
        print(f"[ALARM DEBUG] Verificando tags de alarme. Total plc_data keys: {len(plc_data)}")
        for key in ['XLCLASS_DB10_PARTIDA_DIRETA_ALARMES_TERMICOS',
                    'XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_XLCLASS_EMB14',
                    'XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_EMB15_EMB30',
                    'XLCLASS_DB104_INFO_DISPOSITIVOS_RMT_DESCONEC_LAVADORA_EST_INTEL',
                    'XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_XLCLASS_EMB14',
                    'XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_EMB15_EMB30',
                    'XLCLASS_DB104_INFO_DISPOSITIVOS_MODULO_ERRO_LAVADORA_EST_INTEL']:
            value = plc_data.get(key, 'NOT_IN_PLC_DATA')
            print(f"[ALARM DEBUG] {key}: {value}")
            # Se tem valor > 0 mas não está processando, força inclusão
            if value not in ['NOT_IN_PLC_DATA', None, 0] and key not in alarm_variables:
                alarm_variables.append(key)
        
        # Processa cada variável de alarme
        for var_name in alarm_variables:
            if var_name in plc_data:
                word_value = plc_data[var_name]
                # Normaliza possíveis formatos (ex.: string "13")
                try:
                    if isinstance(word_value, str):
                        v = word_value.strip()
                        if v.startswith("0x") or v.startswith("0X"):
                            word_value = int(v, 16)
                        else:
                            word_value = int(v)
                except Exception:
                    pass
                
                # Converte WORD para bits individuais
                # Aceita None como 0 para evitar perder tags com problema de leitura
                if word_value is None:
                    word_value = 0
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
                                # Preserva o instante real de ativação: se já estava ativo antes,
                                # reutiliza o full_timestamp anterior em vez de gerar um novo
                                try:
                                    prev = self._last_alarm_state.get(alarm_info["id"]) if hasattr(self, "_last_alarm_state") else None
                                    prev_ts = prev.get("full_timestamp") if prev else None
                                    if prev_ts:
                                        alarm_info["full_timestamp"] = prev_ts
                                except Exception:
                                    pass
                                active_alarms.append(alarm_info)
        
        # Ordena do mais recente para o mais antigo
        try:
            active_alarms.sort(key=lambda a: a.get("full_timestamp", ""), reverse=True)
        except Exception:
            pass

        # Registra mudanças no histórico
        self._update_alarm_history(active_alarms, machine)
        
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
            # Converte índice de bit do WORD para índice do array BOOL quando aplicável
            # Nos arquivos de matemática/descrições, o BOOL[0..7] mapeia os bits 8..15
            # e o BOOL[8..15] mapeia os bits 0..7 do WORD. Precisamos alinhar isso
            # para que o índice da descrição corresponda ao índice BOOL.
            def _word_bit_to_bool_index(idx: int, base: str) -> int:
                b = (base or "").upper()
                # Aplicar para DBs que seguem o padrão dos arquivos (DB1/DB04/DB06/DB10/DB104)
                if (
                    b.startswith("DB1_") or
                    b.startswith("DB01_") or
                    b.startswith("DB04_") or
                    b.startswith("DB06_") or
                    b.startswith("DB10_") or
                    b.startswith("DB104_") or
                    b.startswith("DB210_") or
                    b.startswith("DB211_") or
                    b.startswith("DB212_") or
                    b.startswith("DB213_") or
                    b.startswith("DB214_") or
                    b.startswith("DB215_") or
                    b.startswith("DB216_") or
                    b.startswith("DB217_") or
                    b.startswith("DB218_") or
                    b.startswith("DB229_") or
                    b.startswith("DB400_") or
                    b.startswith("DB360_") or
                    b.startswith("DB361_") or
                    b.startswith("DB362_") or
                    b.startswith("DB363_") or
                    b.startswith("DB364_") or
                    b.startswith("DB365_") or
                    b.startswith("DB366_")
                ):
                    if 0 <= idx <= 7:
                        return idx + 8
                    if 8 <= idx <= 15:
                        return idx - 8
                return idx

            desc_index = _word_bit_to_bool_index(bit_index, base_name)

            # Busca a descrição do alarme usando o índice ajustado
            description = self._get_alarm_description(base_name, desc_index)
            # Se não há descrição, permite fallback genérico para bases conhecidas
            if not description:
                if self._allow_generic_for_base(base_name):
                    description = f"{base_name} - Bit {bit_index}"
                else:
                    # Ignora alarmes sem descrição conhecida (evita falsos positivos)
                    return None
            
            # Determina prioridade (com override por bit se configurado)
            # Usa o índice ajustado (BOOL) para casar com tipos_overrides.json
            priority = self._get_priority_with_overrides(base_name, desc_index)
            if not priority:
                # Classifica pela descrição do índice (não pelo nome da tag)
                priority = self._determine_priority_from_description(description)

            # Determina type independente (não depende do nome da tag nem descrição se override existir)
            # Determina type com overrides usando índice ajustado (BOOL)
            alarm_type = self._get_type_with_overrides(base_name, desc_index)
            if not alarm_type:
                # Se não houver type específico, usa a mesma lógica de prioridade como fallback
                # Para bases conhecidas, define type padrão adequado
                default_type = self._default_type_for_base(base_name)
                alarm_type = default_type or priority

            # Mantém prioridade alinhada ao type para refletir na UI/contadores
            priority = alarm_type
            
            # Cria o ID único do alarme (mantém o índice de bit real para identificar o evento)
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
                "date": datetime.now().strftime("%d/%m/%Y"),
                "timestamp": datetime.now().strftime("%H:%M"),
                "full_timestamp": datetime.now().isoformat(),
                "active": True
            }
        
        except Exception as e:
            print(f"[ALARM] Erro ao criar alarme {var_name}[{bit_index}]: {e}")
            return None

    def _allow_generic_for_base(self, base_name: str) -> bool:
        """Permite descrição genérica para bases válidas mesmo sem texto específico.
        Útil quando nem todos os bits foram mapeados no arquivo de descrições ainda.
        """
        b = base_name.upper()
        allow_prefixes = [
            "DB10_PARTIDA_DIRETA_ALARMES_TERMICOS",
            # Permitir genérico para DB104 (alguns índices ainda sem descrição)
            "DB104_INFO_DISPOSITIVOS",
            "DB901_ESTEIRA_INLINE_ALARMES",
            "DB911_DOSIFICADORA_ALARMES",
            "DB921_ESCOVAS_ALARMES",
        ]
        return any(b.startswith(p) for p in allow_prefixes)

    def _default_type_for_base(self, base_name: str) -> Optional[str]:
        """Retorna um tipo padrão por base quando não há overrides e nem descrição."""
        b = base_name.upper()
        if b.startswith("DB10_PARTIDA_DIRETA_ALARMES_TERMICOS"):
            return "thermal"
        # DB104: usar tipos padrão razoáveis quando não houver descrição
        if b.startswith("DB104_INFO_DISPOSITIVOS_DRIVE_ERRO"):
            return "drives"
        if b.startswith("DB104_INFO_DISPOSITIVOS"):
            return "hardware"
        # DB104 deve usar descrições do arquivo e não fallback genérico
        if b.startswith("DB901_ESTEIRA_INLINE_ALARMES"):
            return "process"
        if b.startswith("DB911_DOSIFICADORA_ALARMES"):
            return "process"
        if b.startswith("DB921_ESCOVAS_ALARMES"):
            return "process"
        return None

    def _get_priority_with_overrides(self, base_name: str, bit_index: int) -> Optional[str]:
        """Retorna prioridade via overrides JSON, considerando DB01/DB04 equivalência."""
        # Tentativa direta
        mapping = self.priority_overrides.get(base_name)
        if mapping and bit_index in mapping:
            return mapping[bit_index]
        # Tentativa com prefixo XLCLASS_
        xl_base = f"XLCLASS_{base_name}" if not base_name.startswith("XLCLASS_") else base_name
        if xl_base in self.priority_overrides:
            mapping = self.priority_overrides.get(xl_base)
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
            return str(mapping[bit_index]).lower()
        # Tentativa com prefixo XLCLASS_
        xl_base = f"XLCLASS_{base_name}" if not base_name.startswith("XLCLASS_") else base_name
        mapping = self.type_overrides.get(xl_base)
        if mapping and bit_index in mapping:
            return str(mapping[bit_index]).lower()
        # Tenta variantes com/sem sufixo _INTERNO
        interno_candidates = []
        if base_name.endswith("_INTERNO"):
            interno_candidates.append(base_name[:-8])
        else:
            interno_candidates.append(base_name + "_INTERNO")
        for cand in interno_candidates:
            if cand in self.type_overrides and bit_index in self.type_overrides[cand]:
                return str(self.type_overrides[cand][bit_index]).lower()
            xl_cand = f"XLCLASS_{cand}" if not cand.startswith("XLCLASS_") else cand
            if xl_cand in self.type_overrides and bit_index in self.type_overrides[xl_cand]:
                return str(self.type_overrides[xl_cand][bit_index]).lower()
        candidates = []
        if base_name.startswith("DB01_"):
            candidates.append(base_name.replace("DB01_", "DB04_", 1))
        if base_name.startswith("DB04_"):
            candidates.append(base_name.replace("DB04_", "DB01_", 1))
        for cand in candidates:
            mapping = self.type_overrides.get(cand)
            if mapping and bit_index in mapping:
                return str(mapping[bit_index]).lower()
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
    
    def _get_alarm_description(self, base_name: str, bit_index: int) -> Optional[str]:
        """Obtém a descrição do alarme. Retorna None se não houver descrição nos arquivos."""
        # Atalho específico para DB104: arquivos usam sempre prefixo XLCLASS_ e sufixo _INTERNO
        try:
            if base_name.upper().startswith("DB104_"):
                # Constrói variações para casar com arquivos que trazem 'XLCLASS' também no meio do nome
                variants = [base_name]
                if "_RMT_DESCONEC_EMB" in base_name:
                    variants.append(base_name.replace("_RMT_DESCONEC_EMB", "_RMT_DESCONEC_XLCLASS_EMB"))
                if "_MODULO_ERRO_EMB" in base_name:
                    variants.append(base_name.replace("_MODULO_ERRO_EMB", "_MODULO_ERRO_XLCLASS_EMB"))
                # Para compatibilidade com chaves já prefixadas por XLCLASS_
                expanded = []
                for v in variants:
                    expanded.append(v)
                    if not v.startswith("XLCLASS_"):
                        expanded.append(f"XLCLASS_{v}")
                # Converte todas em forma canônica com _INTERNO e tenta
                for v in expanded:
                    canonical = v if v.startswith("XLCLASS_") else f"XLCLASS_{v}"
                    if not canonical.endswith("_INTERNO"):
                        canonical = f"{canonical}_INTERNO"
                    mapping = self.alarm_descriptions.get(canonical)
                    if mapping and bit_index in mapping:
                        return mapping[bit_index]
        except Exception:
            pass
        # Tenta direto
        if base_name in self.alarm_descriptions:
            descriptions = self.alarm_descriptions[base_name]
            if bit_index in descriptions:
                return descriptions[bit_index]
        # Tenta com prefixo XLCLASS_
        xl_base = f"XLCLASS_{base_name}" if not base_name.startswith("XLCLASS_") else base_name
        if xl_base in self.alarm_descriptions:
            descriptions = self.alarm_descriptions[xl_base]
            if bit_index in descriptions:
                return descriptions[bit_index]
        # Tenta variantes com/sem sufixo _INTERNO (DB104 usa _INTERNO nas descrições)
        interno_candidates = []
        if base_name.endswith("_INTERNO"):
            interno_candidates.append(base_name[:-8])
        else:
            interno_candidates.append(base_name + "_INTERNO")
        for cand in interno_candidates:
            if cand in self.alarm_descriptions and bit_index in self.alarm_descriptions[cand]:
                return self.alarm_descriptions[cand][bit_index]
            xl_cand = f"XLCLASS_{cand}" if not cand.startswith("XLCLASS_") else cand
            if xl_cand in self.alarm_descriptions and bit_index in self.alarm_descriptions[xl_cand]:
                return self.alarm_descriptions[xl_cand][bit_index]
        # Fallback robusto: procura por chaves que comecem com a base (com ou sem XLCLASS_) e
        # também com sufixo _INTERNO. Seleciona a chave mais longa (mais específica).
        try:
            candidates = []
            targets = [base_name]
            if not base_name.endswith("_INTERNO"):
                targets.append(base_name + "_INTERNO")
            # Prefixos com e sem XLCLASS_
            expanded_targets = []
            for t in targets:
                expanded_targets.append(t)
                expanded_targets.append(f"XLCLASS_{t}" if not t.startswith("XLCLASS_") else t)
            for key in self.alarm_descriptions.keys():
                for tgt in expanded_targets:
                    if key.startswith(tgt):
                        candidates.append(key)
                        break
            if candidates:
                # pega a mais específica
                best = sorted(candidates, key=lambda k: len(k), reverse=True)[0]
                mapping = self.alarm_descriptions.get(best, {})
                if bit_index in mapping:
                    return mapping[bit_index]
        except Exception:
            pass
        # Tenta normalizações entre DB01 e DB04
        normalized_candidates = []
        if base_name.startswith("DB01_"):
            normalized_candidates.append(base_name.replace("DB01_", "DB04_", 1))
        if base_name.startswith("DB04_"):
            normalized_candidates.append(base_name.replace("DB04_", "DB01_", 1))
        for candidate in normalized_candidates:
            if candidate in self.alarm_descriptions and bit_index in self.alarm_descriptions[candidate]:
                return self.alarm_descriptions[candidate][bit_index]
        
        # Sem descrição conhecida
        return None
    
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
            "nr12": 0,
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

    def _update_alarm_history(self, active_alarms: List[Dict[str, Any]], machine: str) -> None:
        """Atualiza o histórico de alarmes detectando mudanças de estado"""
        # ✅ PROTEÇÃO: Evita processamento simultâneo que causa duplicação
        if self._history_lock:
            return
        
        self._history_lock = True
        try:
            import time
            current_time = time.time()
            
            # Limpa cache de eventos recentes (mais de 10 segundos)
            self._recent_events = {
                k: v for k, v in self._recent_events.items() 
                if current_time - v < 10.0
            }
            
            # Cria chave única para cada alarme
            current_state = {}
            for alarm in active_alarms:
                alarm_id = alarm["id"]
                current_state[alarm_id] = {
                    "var_name": alarm.get("var_name", ""),
                    "bit_index": alarm.get("bit_index", 0),
                    "timestamp": alarm.get("timestamp", ""),
                    "description": alarm.get("description", ""),
                    "priority": alarm.get("priority", "hardware"),
                    "type": alarm.get("type", "hardware"),
                    "machine": alarm.get("machine", machine),
                    "full_timestamp": alarm.get("full_timestamp")
                }
            
            # ✅ CORREÇÃO: Atualiza estado ANTES de detectar mudanças para evitar duplicação
            # Mas preserva o estado anterior para comparação
            previous_state = self._last_alarm_state.copy()
            self._last_alarm_state = current_state
            
            # Detecta alarmes que acabaram de ativar (não estavam no estado anterior)
            new_alarms = []
            for alarm_id, alarm_data in current_state.items():
                if alarm_id not in previous_state:
                    # ✅ PROTEÇÃO: Verifica se já foi salvo recentemente (evita duplicação)
                    event_key = f"{alarm_id}_activated"
                    if event_key in self._recent_events:
                        print(f"[ALARM HISTORY] ⚠️ Evento 'activated' já processado recentemente, ignorando: {alarm_id}")
                        continue
                    
                    new_alarms.append({
                        "id": alarm_id,
                        "var_name": alarm_data.get("var_name", ""),
                        "bit_index": alarm_data.get("bit_index", 0),
                        "action": "activated",
                        "timestamp": datetime.now().strftime("%H:%M"),
                        "date": datetime.now().strftime("%d/%m/%Y"),
                        "description": alarm_data.get("description", ""),
                        "priority": alarm_data.get("priority", "hardware"),
                        "type": alarm_data.get("type", "hardware"),
                        "machine": alarm_data.get("machine", machine)
                    })
                    # Marca como processado recentemente
                    self._recent_events[event_key] = current_time
                    print(f"[ALARM HISTORY] ✅ Novo alarme detectado: {alarm_id} - {alarm_data.get('description', '')}")
            
            # Detecta alarmes que acabaram de desativar (estavam no estado anterior mas não estão mais)
            cleared_alarms = []
            for alarm_id in previous_state:
                if alarm_id not in current_state:
                    # ✅ PROTEÇÃO: Verifica se já foi salvo recentemente (evita duplicação)
                    event_key = f"{alarm_id}_cleared"
                    if event_key in self._recent_events:
                        print(f"[ALARM HISTORY] ⚠️ Evento 'cleared' já processado recentemente, ignorando: {alarm_id}")
                        continue
                    
                    old_data = previous_state[alarm_id]
                    cleared_alarms.append({
                        "id": alarm_id,
                        "var_name": old_data.get("var_name", ""),
                        "bit_index": old_data.get("bit_index", 0),
                        "action": "cleared",
                        "timestamp": datetime.now().strftime("%H:%M"),
                        "date": datetime.now().strftime("%d/%m/%Y"),
                        "description": old_data.get("description", ""),
                        "priority": old_data.get("priority", "hardware"),
                        "type": old_data.get("type", "hardware"),
                        "machine": old_data.get("machine", machine)
                    })
                    # Marca como processado recentemente
                    self._recent_events[event_key] = current_time
                    print(f"[ALARM HISTORY] ✅ Alarme limpo: {alarm_id} - {old_data.get('description', '')}")
            
            # Salva mudanças no histórico se houver
            if new_alarms or cleared_alarms:
                print(f"[ALARM HISTORY] 📝 Detectadas mudanças: {len(new_alarms)} novos, {len(cleared_alarms)} limpos")
                self._save_to_history(new_alarms + cleared_alarms)
                
        except Exception as e:
            print(f"[ALARM] Erro ao atualizar histórico: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self._history_lock = False

    def _save_to_history(self, alarm_events: List[Dict[str, Any]]) -> None:
        """Salva eventos de alarme no histórico com limite de 1 semana"""
        try:
            if not alarm_events:
                print("[ALARM HISTORY] Nenhum evento para salvar")
                return
                
            print(f"[ALARM HISTORY] Salvando {len(alarm_events)} eventos no histórico...")
            
            # Carrega histórico existente
            history = []
            if os.path.exists(self._history_path):
                try:
                    with open(self._history_path, 'r', encoding='utf-8') as f:
                        history = json.load(f) or []
                    print(f"[ALARM HISTORY] Histórico existente carregado: {len(history)} eventos")
                except Exception as e:
                    print(f"[ALARM HISTORY] Erro ao carregar histórico existente: {e}")
                    history = []
            
            # Adiciona novos eventos com timestamp ISO, evitando duplicatas
            for event in alarm_events:
                if "full_timestamp" not in event:
                    event["full_timestamp"] = datetime.now().isoformat()
                
                # ✅ PROTEÇÃO FINAL: Verifica se já existe evento idêntico no histórico (últimos 30 segundos)
                event_id = event.get("id", "")
                event_action = event.get("action", "")
                event_timestamp = event.get("full_timestamp", "")
                
                # Verifica se já existe um evento com mesmo id, action e timestamp muito próximo (dentro de 30s)
                is_duplicate = False
                if event_timestamp:
                    try:
                        event_time = datetime.fromisoformat(event_timestamp).timestamp()
                        for existing in history:
                            existing_id = existing.get("id", "")
                            existing_action = existing.get("action", "")
                            existing_timestamp = existing.get("full_timestamp", "")
                            
                            if (existing_id == event_id and 
                                existing_action == event_action and 
                                existing_timestamp):
                                try:
                                    existing_time = datetime.fromisoformat(existing_timestamp).timestamp()
                                    # Se os eventos estão dentro de 30 segundos, considera duplicata
                                    if abs(event_time - existing_time) < 30.0:
                                        is_duplicate = True
                                        print(f"[ALARM HISTORY] ⚠️ Duplicata detectada no arquivo, ignorando: {event_id} - {event_action}")
                                        break
                                except:
                                    pass
                    except:
                        pass
                
                if not is_duplicate:
                    history.append(event)
                    print(f"[ALARM HISTORY] ✅ Evento adicionado: {event.get('action', 'unknown')} - {event.get('id', 'unknown')}")
                else:
                    print(f"[ALARM HISTORY] ❌ Evento duplicado ignorado: {event.get('action', 'unknown')} - {event.get('id', 'unknown')}")
            
            # Remove eventos antigos (mais de 7 dias)
            cutoff_date = datetime.now().timestamp() - (7 * 24 * 60 * 60)
            before_cleanup = len(history)
            history = [
                event for event in history 
                if event.get("full_timestamp") and datetime.fromisoformat(event["full_timestamp"]).timestamp() > cutoff_date
            ]
            if before_cleanup != len(history):
                print(f"[ALARM HISTORY] Removidos {before_cleanup - len(history)} eventos antigos (>7 dias)")
            
            # Ordena por timestamp (mais recente primeiro)
            history.sort(key=lambda x: x.get("full_timestamp", ""), reverse=True)
            
            # Limita a 1000 eventos para evitar arquivo muito grande
            if len(history) > 1000:
                print(f"[ALARM HISTORY] Limitando histórico a 1000 eventos (tinha {len(history)})")
                history = history[:1000]
            
            # Salva histórico
            os.makedirs(os.path.dirname(self._history_path), exist_ok=True)
            with open(self._history_path, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
            
            print(f"[ALARM HISTORY] ✅ Histórico salvo com sucesso: {len(history)} eventos no arquivo {self._history_path}")
                
        except Exception as e:
            print(f"[ALARM] Erro ao salvar histórico: {e}")
            import traceback
            traceback.print_exc()

    def get_alarm_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Retorna histórico de alarmes"""
        try:
            print(f"[ALARM HISTORY] Solicitando histórico (limite: {limit}) do arquivo: {self._history_path}")
            
            if not os.path.exists(self._history_path):
                print(f"[ALARM HISTORY] Arquivo não existe: {self._history_path}")
                return []
            
            with open(self._history_path, 'r', encoding='utf-8') as f:
                history = json.load(f) or []
            
            print(f"[ALARM HISTORY] Histórico carregado: {len(history)} eventos totais")
            
            # Retorna os eventos mais recentes (já estão ordenados por timestamp)
            result = history[:limit]
            print(f"[ALARM HISTORY] Retornando {len(result)} eventos")
            return result
            
        except Exception as e:
            print(f"[ALARM] Erro ao carregar histórico: {e}")
            import traceback
            traceback.print_exc()
            return []

# Instância global do processador
alarm_processor = AlarmProcessor()

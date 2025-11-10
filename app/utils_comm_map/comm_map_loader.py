"""
Utilitário para carregar e processar arquivos comm_map.
Suporta tanto formato array quanto formato agrupado por DB.
"""

import json
import os
from typing import Dict, List, Any, Union


def load_comm_map(file_path: str) -> Union[List[Dict], Dict[str, List[Dict]]]:
    """
    Carrega um arquivo comm_map suportando ambos os formatos.
    
    Args:
        file_path: Caminho para o arquivo JSON
    
    Returns:
        - List[Dict] se for formato array (legado)
        - Dict[str, List[Dict]] se for formato agrupado (novo)
    """
    if not os.path.exists(file_path):
        return []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return data


def normalize_comm_map_to_array(comm_map: Union[List[Dict], Dict[str, List[Dict]]]) -> List[Dict]:
    """
    Normaliza comm_map para formato array (legado).
    Se já estiver em formato array, retorna como está.
    Se estiver em formato agrupado, converte para array.
    
    Args:
        comm_map: Comm map em qualquer formato
    
    Returns:
        List[Dict] com todas as tags
    """
    if isinstance(comm_map, list):
        return comm_map
    
    if not isinstance(comm_map, dict):
        return []
    
    # Formato agrupado: { "1": [...], "3": [...] }
    result = []
    
    for db_key, tags in comm_map.items():
        # Ignora metadados
        if db_key.startswith('_'):
            continue
        
        # Converte DB key para número
        try:
            db_num = int(db_key)
        except (ValueError, TypeError):
            continue
        
        # Adiciona cada tag com o campo db
        for tag in tags:
            if not isinstance(tag, dict):
                continue
            
            # Cria entrada no formato array
            normalized_tag = tag.copy()
            normalized_tag['db'] = db_num
            normalized_tag['area'] = 'DB'
            
            result.append(normalized_tag)
    
    return result


def normalize_comm_map_to_grouped(comm_map: Union[List[Dict], Dict[str, List[Dict]]]) -> Dict[str, List[Dict]]:
    """
    Normaliza comm_map para formato agrupado por DB.
    Se já estiver em formato agrupado, retorna como está.
    Se estiver em formato array, agrupa por DB.
    
    Args:
        comm_map: Comm map em qualquer formato
    
    Returns:
        Dict[str, List[Dict]] agrupado por DB
    """
    if isinstance(comm_map, dict):
        # Verifica se já está no formato agrupado (chaves numéricas)
        if all(key.isdigit() or key.startswith('_') for key in comm_map.keys()):
            return comm_map
    
    # Se for array, agrupa por DB
    if not isinstance(comm_map, list):
        return {}
    
    grouped = {}
    for tag in comm_map:
        if not isinstance(tag, dict):
            continue
        
        # Ignora seções
        if '__section__' in tag:
            continue
        
        db = tag.get('db')
        if db is None:
            continue
        
        db_key = str(db)
        if db_key not in grouped:
            grouped[db_key] = []
        
        # Cria entrada sem o campo db (já está na chave)
        tag_entry = tag.copy()
        tag_entry.pop('db', None)
        tag_entry.pop('area', None)  # Remove area também, já sabemos que é DB
        
        grouped[db_key].append(tag_entry)
    
    # Ordena por offset dentro de cada DB
    for db_key in grouped:
        grouped[db_key].sort(key=lambda x: x.get('offset', 0))
    
    return grouped


def get_tags_by_db(comm_map: Union[List[Dict], Dict[str, List[Dict]]], db_number: int) -> List[Dict]:
    """
    Obtém todas as tags de uma DB específica.
    
    Args:
        comm_map: Comm map em qualquer formato
        db_number: Número da DB
    
    Returns:
        List[Dict] com tags da DB (com campo db incluído)
    """
    db_key = str(db_number)
    
    if isinstance(comm_map, dict):
        # Formato agrupado
        if db_key in comm_map:
            tags = comm_map[db_key]
            # Adiciona campos db e area
            result = []
            for tag in tags:
                entry = tag.copy()
                entry['db'] = db_number
                entry['area'] = 'DB'
                result.append(entry)
            return result
        return []
    
    # Formato array
    if isinstance(comm_map, list):
        return [tag for tag in comm_map if isinstance(tag, dict) and tag.get('db') == db_number]
    
    return []


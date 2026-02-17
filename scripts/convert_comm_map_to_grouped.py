#!/usr/bin/env python3
"""
Script para converter arquivos comm_map de formato array para formato agrupado por DB.
Mantém compatibilidade com o formato antigo.

Formato antigo:
[
  {"name": "TAG1", "db": 1, "offset": 0, "type": "WORD"},
  {"name": "TAG2", "db": 1, "offset": 2, "type": "WORD"},
  {"name": "TAG3", "db": 3, "offset": 0, "type": "REAL"}
]

Formato novo (agrupado):
{
  "1": [
    {"name": "TAG1", "offset": 0, "type": "WORD"},
    {"name": "TAG2", "offset": 2, "type": "WORD"}
  ],
  "3": [
    {"name": "TAG3", "offset": 0, "type": "REAL"}
  ]
}
"""

import json
import os
import sys
from pathlib import Path
from collections import defaultdict

def convert_comm_map_to_grouped(input_file, output_file=None):
    """
    Converte um arquivo comm_map de formato array para formato agrupado por DB.
    
    Args:
        input_file: Caminho do arquivo de entrada
        output_file: Caminho do arquivo de saída (se None, sobrescreve o original)
    
    Returns:
        True se converteu com sucesso, False caso contrário
    """
    if output_file is None:
        output_file = input_file
    
    try:
        # Lê o arquivo original
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Verifica se já está no formato agrupado
        if isinstance(data, dict) and all(isinstance(k, str) and k.isdigit() for k in data.keys()):
            print(f"✅ {input_file} já está no formato agrupado")
            return True
        
        # Se não é um array, não pode converter
        if not isinstance(data, list):
            print(f"⚠️ {input_file} não está no formato esperado (array)")
            return False
        
        # Agrupa por DB
        grouped = defaultdict(list)
        sections = {}  # Para manter seções por DB
        current_section = None
        
        for item in data:
            if not isinstance(item, dict):
                continue
            
            # Processa seções
            if '__section__' in item:
                current_section = item['__section__']
                # Tenta extrair DB da seção se possível
                section_text = item['__section__']
                if 'DB' in section_text:
                    # Procura número de DB no texto da seção
                    import re
                    db_match = re.search(r'DB\s*(\d+)', section_text)
                    if db_match:
                        db_num = db_match.group(1)
                        sections[db_num] = current_section
                continue
            
            # Processa tags
            name = item.get('name')
            area = item.get('area', '').upper()
            db = item.get('db')
            
            # Ignora se não for DB ou não tiver nome
            if not name or area != 'DB' or db is None:
                continue
            
            # Cria entrada agrupada (sem db, pois já está na chave)
            tag_entry = {
                'name': name,
                'offset': item.get('offset', 0),
                'type': item.get('type', 'WORD').upper()
            }
            
            # Adiciona campos opcionais
            if 'byte' in item:
                tag_entry['byte'] = item['byte']
            if 'bit' in item:
                tag_entry['bit'] = item['bit']
            if 'description' in item:
                tag_entry['description'] = item['description']
            if 'units' in item:
                tag_entry['units'] = item['units']
            if 'important' in item:
                tag_entry['important'] = item['important']
            
            # Ordena por offset dentro de cada DB
            db_key = str(db)
            grouped[db_key].append(tag_entry)
        
        # Ordena tags por offset dentro de cada DB
        for db_key in grouped:
            grouped[db_key].sort(key=lambda x: x.get('offset', 0))
        
        # Cria estrutura final com metadados
        result = {
            '_format': 'grouped_by_db',
            '_version': '1.0',
            '_sections': sections,
            **grouped
        }
        
        # Remove chave _sections se estiver vazia
        if not sections:
            del result['_sections']
        
        # Salva arquivo convertido
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        total_tags = sum(len(tags) for tags in grouped.values())
        print(f"✅ {input_file} convertido: {len(grouped)} DBs, {total_tags} tags")
        return True
        
    except Exception as e:
        print(f"❌ Erro ao converter {input_file}: {e}")
        return False

def main():
    """Converte todos os arquivos comm_map na pasta config/comm_map"""
    comm_map_dir = Path('config/comm_map')
    
    if not comm_map_dir.exists():
        print(f"❌ Diretório {comm_map_dir} não encontrado")
        sys.exit(1)
    
    # Arquivos para converter
    files_to_convert = [
        '200CX.json',
        '400CX.json',
        '700CX.json'
    ]
    
    converted = 0
    failed = 0
    
    for filename in files_to_convert:
        filepath = comm_map_dir / filename
        
        if not filepath.exists():
            print(f"⚠️ {filepath} não encontrado, pulando...")
            continue
        
        # Cria backup antes de converter
        backup_path = filepath.with_suffix('.json.backup')
        if not backup_path.exists():
            import shutil
            shutil.copy2(filepath, backup_path)
            print(f"📋 Backup criado: {backup_path}")
        
        if convert_comm_map_to_grouped(filepath):
            converted += 1
        else:
            failed += 1
    
    print(f"\n{'='*60}")
    print(f"✅ Convertidos: {converted}")
    print(f"❌ Falhas: {failed}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()


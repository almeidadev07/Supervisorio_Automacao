#!/usr/bin/env python3
"""
Script para separar tags LS dos arquivos comm_map
As tags LS utilizam IPs diferentes (outro PLC) e devem ser separadas
"""

import json
import os
import shutil
from pathlib import Path

# Configuração de IPs por máquina
LS_IPS = {
    "700CX": "100.70.110.10",
    "400CX": "100.40.110.10",
    "200CX": "100.20.110.10"
}

def is_ls_tag(tag_name):
    """Verifica se a tag começa com LS"""
    return tag_name.startswith("LS")

def separate_ls_tags(machine_name, comm_map_file):
    """Separa tags LS do arquivo comm_map"""
    
    print(f"\n{'='*60}")
    print(f"Processando {machine_name}...")
    print(f"{'='*60}")
    
    # Carrega o arquivo original
    with open(comm_map_file, 'r', encoding='utf-8') as f:
        comm_map = json.load(f)
    
    # Cria backup
    backup_file = f"{comm_map_file}.backup_ls_separation"
    shutil.copy2(comm_map_file, backup_file)
    print(f"✅ Backup criado: {backup_file}")
    
    # Estrutura para tags LS
    ls_comm_map = {
        "_format": "grouped_by_db",
        "_version": "1.0",
        "_plc_ip": LS_IPS[machine_name],
        "_plc_type": "block_reader",
        "_rack": 0,
        "_slot": 1,
        "_sections": {},
    }
    
    # Estrutura para tags XLCLASS (original sem LS)
    xlclass_comm_map = {
        "_format": "grouped_by_db",
        "_version": "1.0",
        "_sections": {},
    }
    
    # Processa cada seção
    sections = comm_map.get("_sections", {})
    ls_tags_count = 0
    xlclass_tags_count = 0
    
    for db_num, db_description in sections.items():
        db_tags = comm_map.get(db_num, [])
        
        if not db_tags:
            continue
        
        # Separa tags LS e XLCLASS
        ls_tags = []
        xlclass_tags = []
        
        for tag in db_tags:
            tag_name = tag.get("name", "")
            if is_ls_tag(tag_name):
                ls_tags.append(tag)
                ls_tags_count += 1
            else:
                xlclass_tags.append(tag)
                xlclass_tags_count += 1
        
        # Adiciona seções LS se houver tags
        if ls_tags:
            ls_comm_map["_sections"][db_num] = db_description
            ls_comm_map[db_num] = ls_tags
            print(f"  📦 DB{db_num}: {len(ls_tags)} tags LS encontradas")
        
        # Adiciona seções XLCLASS se houver tags
        # Se a descrição menciona LS, atualiza para XLCLASS
        if xlclass_tags:
            # Atualiza descrição se mencionar LS mas não mencionar XLCLASS
            if "LS" in db_description and "XLCLASS" not in db_description:
                # Tenta extrair o nome da DB da descrição original
                if "DB10" in db_description:
                    xlclass_comm_map["_sections"][db_num] = "XLCLASS - DB10 - PARTIDA DIRETA"
                else:
                    # Mantém a descrição mas remove referência LS
                    new_desc = db_description.replace("LS400", "XLCLASS")
                    # Remove referência ao IP do PLC se houver
                    import re
                    new_desc = re.sub(r'\s*\(PLC\s+[\d.]+\)', '', new_desc).strip()
                    xlclass_comm_map["_sections"][db_num] = new_desc
            else:
                xlclass_comm_map["_sections"][db_num] = db_description
            xlclass_comm_map[db_num] = xlclass_tags
    
    # Salva arquivo LS separado
    ls_file = comm_map_file.replace(f"{machine_name}.json", f"{machine_name}_LS.json")
    with open(ls_file, 'w', encoding='utf-8') as f:
        json.dump(ls_comm_map, f, indent=2, ensure_ascii=False)
    print(f"✅ Arquivo LS criado: {ls_file} ({ls_tags_count} tags)")
    
    # Salva arquivo XLCLASS (original sem LS)
    with open(comm_map_file, 'w', encoding='utf-8') as f:
        json.dump(xlclass_comm_map, f, indent=2, ensure_ascii=False)
    print(f"✅ Arquivo XLCLASS atualizado: {comm_map_file} ({xlclass_tags_count} tags)")
    
    return ls_tags_count, xlclass_tags_count

def main():
    """Função principal"""
    script_dir = Path(__file__).parent
    comm_map_dir = script_dir.parent / "config" / "comm_map"
    
    machines = ["700CX", "400CX", "200CX"]
    
    total_ls = 0
    total_xlclass = 0
    
    for machine in machines:
        comm_map_file = comm_map_dir / f"{machine}.json"
        
        if not comm_map_file.exists():
            print(f"⚠️  Arquivo não encontrado: {comm_map_file}")
            continue
        
        try:
            ls_count, xlclass_count = separate_ls_tags(machine, str(comm_map_file))
            total_ls += ls_count
            total_xlclass += xlclass_count
        except Exception as e:
            print(f"❌ Erro ao processar {machine}: {e}")
            import traceback
            traceback.print_exc()
    
    print(f"\n{'='*60}")
    print(f"RESUMO:")
    print(f"  Tags LS separadas: {total_ls}")
    print(f"  Tags XLCLASS mantidas: {total_xlclass}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()


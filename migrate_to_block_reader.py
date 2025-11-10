#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de migração para o sistema BlockReader
Facilita a transição do sistema atual para o BlockReader
"""

import json
import os
import shutil
from datetime import datetime

def backup_current_config():
    """Faz backup da configuração atual"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"backup_config_{timestamp}"
    
    print(f"📦 Criando backup da configuração atual em {backup_dir}/")
    
    os.makedirs(backup_dir, exist_ok=True)
    
    # Arquivos para backup
    files_to_backup = [
        "app/services/plc_controller.py",
        "app/plc_drivers/__init__.py",
        "config/machines_config.json"
    ]
    
    for file_path in files_to_backup:
        if os.path.exists(file_path):
            dest_path = os.path.join(backup_dir, file_path)
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            shutil.copy2(file_path, dest_path)
            print(f"  ✅ {file_path} -> {dest_path}")
    
    return backup_dir

def update_machines_config():
    """Atualiza configuração das máquinas para usar BlockReader"""
    config_file = "config/machines_config.json"
    
    if not os.path.exists(config_file):
        print(f"❌ Arquivo {config_file} não encontrado!")
        return False
    
    print(f"🔧 Atualizando {config_file}...")
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            machines_config = json.load(f)
        
        # Atualiza cada máquina para usar BlockReader
        updated = False
        for machine in machines_config:
            if machine.get('plc_type') != 'block_reader':
                machine['plc_type'] = 'block_reader'
                machine['rack'] = machine.get('rack', 0)
                machine['slot'] = machine.get('slot', 1)
                machine['poll_interval'] = machine.get('poll_interval', 0.1)
                updated = True
                print(f"  ✅ {machine.get('name')} -> BlockReader")
        
        if updated:
            # Salva configuração atualizada
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(machines_config, f, indent=2, ensure_ascii=False)
            print(f"  💾 Configuração salva em {config_file}")
        else:
            print(f"  ℹ️ Configuração já está atualizada")
        
        return True
        
    except Exception as e:
        print(f"❌ Erro ao atualizar configuração: {e}")
        return False

def create_test_script():
    """Cria script de teste para validar a migração"""
    test_script = """#!/usr/bin/env python3
# -*- coding: utf-8 -*-
\"\"\"
Script de teste pós-migração para BlockReader
Execute este script para validar se a migração foi bem-sucedida
\"\"\"

import sys
import os
import time

# Adiciona o diretório raiz ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_migration():
    \"\"\"Testa se a migração foi bem-sucedida\"\"\"
    print("🧪 Testando migração para BlockReader...")
    
    try:
        # Testa importação dos módulos
        from app.plc_drivers.block_reader import BlockReaderPLC
        from app.services.plc_controller_block import BlockPLCController
        print("✅ Módulos BlockReader importados com sucesso")
        
        # Testa criação de driver
        test_config = {
            'name': 'TEST',
            'default_plc_ip': '192.168.0.1',
            'plc_type': 'block_reader',
            'rack': 0,
            'slot': 1,
            'poll_interval': 0.1,
            'comm_map': []
        }
        
        driver = BlockReaderPLC(test_config['default_plc_ip'], test_config)
        print("✅ Driver BlockReader criado com sucesso")
        
        # Testa configuração das máquinas
        config_file = "config/machines_config.json"
        if os.path.exists(config_file):
            with open(config_file, 'r', encoding='utf-8') as f:
                machines_config = json.load(f)
            
            block_machines = [m for m in machines_config if m.get('plc_type') == 'block_reader']
            print(f"✅ {len(block_machines)} máquinas configuradas para BlockReader")
            
            for machine in block_machines:
                print(f"  - {machine.get('name')}: {machine.get('default_plc_ip')}")
        else:
            print("⚠️ Arquivo de configuração não encontrado")
        
        print("\\n🎉 Migração validada com sucesso!")
        print("\\n📋 Próximos passos:")
        print("  1. Execute o aplicativo normalmente")
        print("  2. Monitore os logs para verificar estabilidade")
        print("  3. Execute 'test_block_reader.py' para testes detalhados")
        
        return True
        
    except Exception as e:
        print(f"❌ Erro na validação: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_migration()
"""
    
    with open("test_migration.py", "w", encoding="utf-8") as f:
        f.write(test_script)
    
    print("✅ Script de teste criado: test_migration.py")

def main():
    """Função principal de migração"""
    print("🚀 Iniciando migração para BlockReader...")
    print("=" * 50)
    
    # 1. Backup da configuração atual
    backup_dir = backup_current_config()
    
    # 2. Atualiza configuração das máquinas
    if not update_machines_config():
        print("❌ Falha na atualização da configuração")
        return False
    
    # 3. Cria script de teste
    create_test_script()
    
    print("\n✅ Migração concluída com sucesso!")
    print(f"📦 Backup salvo em: {backup_dir}/")
    print("\n📋 Resumo das mudanças:")
    print("  - Sistema principal agora usa BlockReader")
    print("  - Configuração das máquinas atualizada")
    print("  - Script de teste criado")
    print("\n🔧 Para reverter (se necessário):")
    print(f"  - Restaure os arquivos de {backup_dir}/")
    print("  - Ou execute: git checkout -- app/services/plc_controller.py")
    print("\n🧪 Para testar:")
    print("  - Execute: python test_migration.py")
    print("  - Execute: python test_block_reader.py")
    
    return True

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n⏹️ Migração interrompida pelo usuário")
    except Exception as e:
        print(f"\n❌ Erro durante a migração: {e}")
        import traceback
        traceback.print_exc()

#!/usr/bin/env python3
"""
Gerador Simples - Um arquivo por alarme
Apenas move cada bit da WORD para variável BOOL indexada
"""

import json
import os
from typing import List, Dict, Any

class GeradorSimples:
    def __init__(self, comm_map_path: str = "config/comm_map"):
        self.comm_map_path = comm_map_path
        self.machines = ["200CX", "400CX", "700CX"]
    
    def load_comm_map(self, machine: str) -> List[Dict[str, Any]]:
        """Carrega o arquivo de mapeamento de comunicação"""
        file_path = os.path.join(self.comm_map_path, f"{machine}.json")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Arquivo não encontrado: {file_path}")
            return []
        except json.JSONDecodeError as e:
            print(f"Erro ao decodificar JSON: {e}")
            return []
    
    def is_word_type(self, item: Dict[str, Any]) -> bool:
        """Verifica se o item é do tipo WORD"""
        return item.get("type") == "WORD"
    
    def is_emergency_alarm(self, name: str) -> bool:
        """Verifica se é um alarme de emergência"""
        return "EMERG" in name.upper() or "ALARMES" in name.upper()
    
    def generate_simple_conversion_file(self, alarm_name: str, db: int, offset: int, description: str) -> str:
        """Gera arquivo de conversão simples para um alarme específico"""
        
        # Nome base para as variáveis BOOL
        base_name = alarm_name.replace("XLCLASS_", "").replace("_WORD", "")
        bool_array_name = f"{base_name}_BOOL"
        
        # Gera o arquivo de conversão
        code = f"""// ========================================
// CONVERSÃO SIMPLES WORD -> BOOL
// {alarm_name}
// DB{db}, Offset {offset}
// {description}
// ========================================

// Declaração da variável BOOL
BOOL {bool_array_name}[16]

// Conversões dos bits
{bool_array_name}[0] = {alarm_name}.B0
{bool_array_name}[1] = {alarm_name}.B1
{bool_array_name}[2] = {alarm_name}.B2
{bool_array_name}[3] = {alarm_name}.B3
{bool_array_name}[4] = {alarm_name}.B4
{bool_array_name}[5] = {alarm_name}.B5
{bool_array_name}[6] = {alarm_name}.B6
{bool_array_name}[7] = {alarm_name}.B7
{bool_array_name}[8] = {alarm_name}.B8
{bool_array_name}[9] = {alarm_name}.B9
{bool_array_name}[10] = {alarm_name}.B10
{bool_array_name}[11] = {alarm_name}.B11
{bool_array_name}[12] = {alarm_name}.B12
{bool_array_name}[13] = {alarm_name}.B13
{bool_array_name}[14] = {alarm_name}.B14
{bool_array_name}[15] = {alarm_name}.B15

// ========================================
// USO:
// - {bool_array_name}[0] a {bool_array_name}[15] contêm os bits da WORD
// - Cada índice representa um bit específico (0-15)
// - Use os arquivos na pasta 'alarmes/' para descrições detalhadas
// ========================================
"""
        return code
    
    def generate_alarm_descriptions_file(self, alarm_name: str, db: int, offset: int, description: str) -> str:
        """Gera arquivo de descrições para um alarme específico"""
        
        base_name = alarm_name.replace("XLCLASS_", "").replace("_WORD", "")
        bool_array_name = f"{base_name}_BOOL"
        
        # Gera descrições baseadas no tipo de alarme
        if "ALARMES_ALTO_PRINCIPAIS" in alarm_name:
            descriptions = [
                "Alarme Alto Principal - Bit 0",
                "Alarme Alto Principal - Bit 1",
                "Alarme Alto Principal - Bit 2",
                "Alarme Alto Principal - Bit 3",
                "Alarme Alto Principal - Bit 4",
                "Alarme Alto Principal - Bit 5",
                "Alarme Alto Principal - Bit 6",
                "Alarme Alto Principal - Bit 7",
                "Alarme Alto Principal - Bit 8",
                "Alarme Alto Principal - Bit 9",
                "Alarme Alto Principal - Bit 10",
                "Alarme Alto Principal - Bit 11",
                "Alarme Alto Principal - Bit 12",
                "Alarme Alto Principal - Bit 13",
                "Alarme Alto Principal - Bit 14",
                "Alarme Alto Principal - Bit 15"
            ]
        elif "AUXILIAR_EMERGENCIA_COMANDO_01" in alarm_name:
            descriptions = [
                "Comando Emergência Auxiliar 01 - Bit 0",
                "Comando Emergência Auxiliar 01 - Bit 1",
                "Comando Emergência Auxiliar 01 - Bit 2",
                "Comando Emergência Auxiliar 01 - Bit 3",
                "Comando Emergência Auxiliar 01 - Bit 4",
                "Comando Emergência Auxiliar 01 - Bit 5",
                "Comando Emergência Auxiliar 01 - Bit 6",
                "Comando Emergência Auxiliar 01 - Bit 7",
                "Comando Emergência Auxiliar 01 - Bit 8",
                "Comando Emergência Auxiliar 01 - Bit 9",
                "Comando Emergência Auxiliar 01 - Bit 10",
                "Comando Emergência Auxiliar 01 - Bit 11",
                "Comando Emergência Auxiliar 01 - Bit 12",
                "Comando Emergência Auxiliar 01 - Bit 13",
                "Comando Emergência Auxiliar 01 - Bit 14",
                "Comando Emergência Auxiliar 01 - Bit 15"
            ]
        elif "AUXILIAR_EMERGENCIA_COMANDO_02" in alarm_name:
            descriptions = [
                "Comando Emergência Auxiliar 02 - Bit 0",
                "Comando Emergência Auxiliar 02 - Bit 1",
                "Comando Emergência Auxiliar 02 - Bit 2",
                "Comando Emergência Auxiliar 02 - Bit 3",
                "Comando Emergência Auxiliar 02 - Bit 4",
                "Comando Emergência Auxiliar 02 - Bit 5",
                "Comando Emergência Auxiliar 02 - Bit 6",
                "Comando Emergência Auxiliar 02 - Bit 7",
                "Comando Emergência Auxiliar 02 - Bit 8",
                "Comando Emergência Auxiliar 02 - Bit 9",
                "Comando Emergência Auxiliar 02 - Bit 10",
                "Comando Emergência Auxiliar 02 - Bit 11",
                "Comando Emergência Auxiliar 02 - Bit 12",
                "Comando Emergência Auxiliar 02 - Bit 13",
                "Comando Emergência Auxiliar 02 - Bit 14",
                "Comando Emergência Auxiliar 02 - Bit 15"
            ]
        elif "EMERG_PAINEL_PRINCIPAL" in alarm_name:
            descriptions = [
                "Painel Principal - Emergência Bit 0",
                "Painel Principal - Emergência Bit 1",
                "Painel Principal - Emergência Bit 2",
                "Painel Principal - Emergência Bit 3",
                "Painel Principal - Emergência Bit 4",
                "Painel Principal - Emergência Bit 5",
                "Painel Principal - Emergência Bit 6",
                "Painel Principal - Emergência Bit 7",
                "Painel Principal - Emergência Bit 8",
                "Painel Principal - Emergência Bit 9",
                "Painel Principal - Emergência Bit 10",
                "Painel Principal - Emergência Bit 11",
                "Painel Principal - Emergência Bit 12",
                "Painel Principal - Emergência Bit 13",
                "Painel Principal - Emergência Bit 14",
                "Painel Principal - Emergência Bit 15"
            ]
        elif "EMERG_LAVADORA" in alarm_name:
            descriptions = [
                "Lavadora - Emergência Bit 0",
                "Lavadora - Emergência Bit 1",
                "Lavadora - Emergência Bit 2",
                "Lavadora - Emergência Bit 3",
                "Lavadora - Emergência Bit 4",
                "Lavadora - Emergência Bit 5",
                "Lavadora - Emergência Bit 6",
                "Lavadora - Emergência Bit 7",
                "Lavadora - Emergência Bit 8",
                "Lavadora - Emergência Bit 9",
                "Lavadora - Emergência Bit 10",
                "Lavadora - Emergência Bit 11",
                "Lavadora - Emergência Bit 12",
                "Lavadora - Emergência Bit 13",
                "Lavadora - Emergência Bit 14",
                "Lavadora - Emergência Bit 15"
            ]
        elif "EMERG_EST_INTELIGENTES" in alarm_name:
            descriptions = [
                "Esteiras Inteligentes - Emergência Bit 0",
                "Esteiras Inteligentes - Emergência Bit 1",
                "Esteiras Inteligentes - Emergência Bit 2",
                "Esteiras Inteligentes - Emergência Bit 3",
                "Esteiras Inteligentes - Emergência Bit 4",
                "Esteiras Inteligentes - Emergência Bit 5",
                "Esteiras Inteligentes - Emergência Bit 6",
                "Esteiras Inteligentes - Emergência Bit 7",
                "Esteiras Inteligentes - Emergência Bit 8",
                "Esteiras Inteligentes - Emergência Bit 9",
                "Esteiras Inteligentes - Emergência Bit 10",
                "Esteiras Inteligentes - Emergência Bit 11",
                "Esteiras Inteligentes - Emergência Bit 12",
                "Esteiras Inteligentes - Emergência Bit 13",
                "Esteiras Inteligentes - Emergência Bit 14",
                "Esteiras Inteligentes - Emergência Bit 15"
            ]
        elif "EMERG_ALIMENTADOR" in alarm_name:
            descriptions = [
                "Alimentador - Emergência Bit 0",
                "Alimentador - Emergência Bit 1",
                "Alimentador - Emergência Bit 2",
                "Alimentador - Emergência Bit 3",
                "Alimentador - Emergência Bit 4",
                "Alimentador - Emergência Bit 5",
                "Alimentador - Emergência Bit 6",
                "Alimentador - Emergência Bit 7",
                "Alimentador - Emergência Bit 8",
                "Alimentador - Emergência Bit 9",
                "Alimentador - Emergência Bit 10",
                "Alimentador - Emergência Bit 11",
                "Alimentador - Emergência Bit 12",
                "Alimentador - Emergência Bit 13",
                "Alimentador - Emergência Bit 14",
                "Alimentador - Emergência Bit 15"
            ]
        elif "EMERG_OVOSCOPIA" in alarm_name:
            descriptions = [
                "Ovoscopia - Emergência Bit 0",
                "Ovoscopia - Emergência Bit 1",
                "Ovoscopia - Emergência Bit 2",
                "Ovoscopia - Emergência Bit 3",
                "Ovoscopia - Emergência Bit 4",
                "Ovoscopia - Emergência Bit 5",
                "Ovoscopia - Emergência Bit 6",
                "Ovoscopia - Emergência Bit 7",
                "Ovoscopia - Emergência Bit 8",
                "Ovoscopia - Emergência Bit 9",
                "Ovoscopia - Emergência Bit 10",
                "Ovoscopia - Emergência Bit 11",
                "Ovoscopia - Emergência Bit 12",
                "Ovoscopia - Emergência Bit 13",
                "Ovoscopia - Emergência Bit 14",
                "Ovoscopia - Emergência Bit 15"
            ]
        elif "EMERG_PRESELECIONADOR" in alarm_name:
            descriptions = [
                "Preselecionador - Emergência Bit 0",
                "Preselecionador - Emergência Bit 1",
                "Preselecionador - Emergência Bit 2",
                "Preselecionador - Emergência Bit 3",
                "Preselecionador - Emergência Bit 4",
                "Preselecionador - Emergência Bit 5",
                "Preselecionador - Emergência Bit 6",
                "Preselecionador - Emergência Bit 7",
                "Preselecionador - Emergência Bit 8",
                "Preselecionador - Emergência Bit 9",
                "Preselecionador - Emergência Bit 10",
                "Preselecionador - Emergência Bit 11",
                "Preselecionador - Emergência Bit 12",
                "Preselecionador - Emergência Bit 13",
                "Preselecionador - Emergência Bit 14",
                "Preselecionador - Emergência Bit 15"
            ]
        elif "EMERG_EMB" in alarm_name:
            # Extrai número da embaladora
            emb_num = alarm_name.split("EMB")[1].split("_")[0]
            descriptions = [
                f"Embaladora {emb_num} - Emergência Bit 0",
                f"Embaladora {emb_num} - Emergência Bit 1",
                f"Embaladora {emb_num} - Emergência Bit 2",
                f"Embaladora {emb_num} - Emergência Bit 3",
                f"Embaladora {emb_num} - Emergência Bit 4",
                f"Embaladora {emb_num} - Emergência Bit 5",
                f"Embaladora {emb_num} - Emergência Bit 6",
                f"Embaladora {emb_num} - Emergência Bit 7",
                f"Embaladora {emb_num} - Emergência Bit 8",
                f"Embaladora {emb_num} - Emergência Bit 9",
                f"Embaladora {emb_num} - Emergência Bit 10",
                f"Embaladora {emb_num} - Emergência Bit 11",
                f"Embaladora {emb_num} - Emergência Bit 12",
                f"Embaladora {emb_num} - Emergência Bit 13",
                f"Embaladora {emb_num} - Emergência Bit 14",
                f"Embaladora {emb_num} - Emergência Bit 15"
            ]
        else:
            # Descrições genéricas
            descriptions = [
                f"{base_name} - Bit 0",
                f"{base_name} - Bit 1",
                f"{base_name} - Bit 2",
                f"{base_name} - Bit 3",
                f"{base_name} - Bit 4",
                f"{base_name} - Bit 5",
                f"{base_name} - Bit 6",
                f"{base_name} - Bit 7",
                f"{base_name} - Bit 8",
                f"{base_name} - Bit 9",
                f"{base_name} - Bit 10",
                f"{base_name} - Bit 11",
                f"{base_name} - Bit 12",
                f"{base_name} - Bit 13",
                f"{base_name} - Bit 14",
                f"{base_name} - Bit 15"
            ]
        
        # Gera o arquivo de descrições
        code = f"""// ========================================
// DESCRIÇÕES DOS ÍNDICES
// {alarm_name}
// DB{db}, Offset {offset}
// {description}
// ========================================

// Array: {bool_array_name}[16]
// Cada índice representa um bit específico da WORD

"""
        
        for i, desc in enumerate(descriptions):
            code += f"// [{i:2d}] {bool_array_name}[{i}] = {desc}\n"
        
        code += f"""
// ========================================
// EXEMPLO DE USO:
// IF {bool_array_name}[0] THEN
//     // {descriptions[0]}
// END_IF
// ========================================
"""
        
        return code
    
    def generate_all_files(self):
        """Gera todos os arquivos para todas as máquinas"""
        # Cria diretórios
        os.makedirs("matematica", exist_ok=True)
        os.makedirs("alarmes", exist_ok=True)
        
        total_files = 0
        
        for machine in self.machines:
            print(f"\nProcessando {machine}...")
            
            comm_map = self.load_comm_map(machine)
            if not comm_map:
                continue
            
            # Filtra apenas variáveis WORD que são alarmes
            word_alarms = [
                item for item in comm_map 
                if self.is_word_type(item) and self.is_emergency_alarm(item.get("name", ""))
            ]
            
            for item in word_alarms:
                name = item["name"]
                db = item["db"]
                offset = item["offset"]
                description = item.get("description", "")
                
                # Nome base para os arquivos
                base_name = name.replace("XLCLASS_", "").replace("_WORD", "")
                
                # Gera arquivo de conversão na pasta matematica
                conversion_content = self.generate_simple_conversion_file(name, db, offset, description)
                conversion_filename = f"matematica/{base_name}.txt"
                with open(conversion_filename, 'w', encoding='utf-8') as f:
                    f.write(conversion_content)
                
                # Gera arquivo de descrições na pasta alarmes
                descriptions_content = self.generate_alarm_descriptions_file(name, db, offset, description)
                descriptions_filename = f"alarmes/{base_name}_descricoes.txt"
                with open(descriptions_filename, 'w', encoding='utf-8') as f:
                    f.write(descriptions_content)
                
                total_files += 2
                print(f"  ✓ {base_name}.txt")
                print(f"  ✓ {base_name}_descricoes.txt")
        
        print(f"\n✅ Total de arquivos gerados: {total_files}")
        print(f"📁 Pasta matematica/: {total_files // 2} arquivos de conversão")
        print(f"📁 Pasta alarmes/: {total_files // 2} arquivos de descrições")

def main():
    """Função principal"""
    print("="*60)
    print("GERADOR SIMPLES - UM ARQUIVO POR ALARME")
    print("="*60)
    
    generator = GeradorSimples()
    generator.generate_all_files()
    
    print("\n" + "="*60)
    print("GERAÇÃO CONCLUÍDA!")
    print("="*60)
    print("\n📁 Pasta matematica/: Arquivos de conversão WORD -> BOOL")
    print("📁 Pasta alarmes/: Arquivos com descrições dos índices")
    print("\n🎯 Cada alarme tem seu próprio arquivo!")

if __name__ == "__main__":
    main()

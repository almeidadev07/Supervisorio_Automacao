#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teste do Carregador de Receitas
Demonstra o funcionamento do sistema de carregamento de receitas
"""

import json
import sys
import os

# Adiciona o diretório atual ao path para importar o carregador
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from carregador_receitas import CarregadorReceitas

def testar_carregador():
    """Testa o carregador de receitas"""
    print("=== TESTE DO CARREGADOR DE RECEITAS ===\n")
    
    # Cria instância do carregador
    carregador = CarregadorReceitas()
    
    # 1. Testa criação de receita de exemplo
    print("1. Criando receita de exemplo...")
    receita_json = carregador.criar_receita_exemplo()
    print("Receita criada:")
    print(receita_json)
    print()
    
    # 2. Testa carregamento da receita
    print("2. Carregando receita do JSON...")
    receita = carregador.carregar_receita_do_json(json.loads(receita_json))
    print(f"Receita carregada: {receita.nome}")
    print(f"Embaladoras: {len(receita.configuracao)}")
    for emb in receita.configuracao:
        print(f"  - {emb.id}: {len(emb.classes)} classes")
    print()
    
    # 3. Testa validação da receita
    print("3. Validando receita...")
    erros = carregador.validar_receita(receita)
    if erros:
        print("❌ Erros encontrados:")
        for erro in erros:
            print(f"  - {erro}")
    else:
        print("✅ Receita válida!")
    print()
    
    # 4. Testa geração de tags PLC
    print("4. Gerando tags para PLC...")
    tags = carregador.gerar_tags_plc_para_receita(receita)
    print(f"Tags geradas: {len(tags)} tags")
    print("\nTags por categoria:")
    
    # Agrupa tags por tipo
    db200_tags = {k: v for k, v in tags.items() if 'DB200' in k}
    db201_tags = {k: v for k, v in tags.items() if 'DB201' in k}
    
    print(f"\nDB200 (Branco) - {len(db200_tags)} tags:")
    for tag, valor in sorted(db200_tags.items()):
        print(f"  {tag}: {valor}")
    
    print(f"\nDB201 (Vermelho) - {len(db201_tags)} tags:")
    for tag, valor in sorted(db201_tags.items()):
        print(f"  {tag}: {valor}")
    
    # 5. Testa mapeamento de embaladoras
    print("\n5. Testando mapeamento de embaladoras...")
    for emb_id in ['IND', 'E01', 'E15', 'E16', 'E24', 'SPJ']:
        mapping = carregador.get_embaladora_bit_and_index(emb_id)
        if mapping:
            print(f"  {emb_id}: index={mapping[0]}, bit={mapping[1]}")
        else:
            print(f"  {emb_id}: mapeamento inválido")
    
    # 6. Testa mapeamento de classes SPJ
    print("\n6. Testando mapeamento de classes SPJ...")
    for class_id in ['VISIO', 'C1', 'C2', 'C7', 'CRACK']:
        bit = carregador.spj_class_to_bit.get(class_id)
        print(f"  {class_id}: bit={bit}")
    
    print("\n=== TESTE CONCLUÍDO ===")

def testar_receita_complexa():
    """Testa com uma receita mais complexa"""
    print("\n=== TESTE COM RECEITA COMPLEXA ===\n")
    
    carregador = CarregadorReceitas()
    
    # Receita complexa com múltiplas embaladoras e classes
    receita_complexa = {
        "id": 9999999999,
        "nome": "Receita Complexa Teste",
        "configuracao": [
            {
                "id": "IND",
                "nome": "IND",
                "classes": [
                    {"id": "C1", "nome": "C1", "cor": "#FF3399", "tipo": "branco"},
                    {"id": "C2", "nome": "C2", "cor": "#FFFF00", "tipo": "vermelho"},
                    {"id": "C3", "nome": "C3", "cor": "#0000FF", "tipo": "misto"}
                ]
            },
            {
                "id": "E01",
                "nome": "E01",
                "classes": [
                    {"id": "C4", "nome": "C4", "cor": "#33CC33", "tipo": "branco"},
                    {"id": "C5", "nome": "C5", "cor": "#FF6600", "tipo": "vermelho"}
                ]
            },
            {
                "id": "E15",
                "nome": "E15",
                "classes": [
                    {"id": "C6", "nome": "C6", "cor": "#33CCFF", "tipo": "misto"},
                    {"id": "C7", "nome": "C7", "cor": "#00FF99", "tipo": "branco"}
                ]
            },
            {
                "id": "E16",
                "nome": "E16",
                "classes": [
                    {"id": "CRACK", "nome": "CRACK", "cor": "#999999", "tipo": "misto"}
                ]
            },
            {
                "id": "SPJ",
                "nome": "SPJ",
                "classes": [
                    {"id": "VISIO", "nome": "VISIO", "cor": "#663399", "tipo": "misto"},
                    {"id": "C1", "nome": "C1", "cor": "#FF3399", "tipo": "branco"},
                    {"id": "C2", "nome": "C2", "cor": "#FFFF00", "tipo": "vermelho"}
                ]
            }
        ],
        "dataCriacao": "2024-01-01T00:00:00.000Z"
    }
    
    print("Receita complexa criada:")
    print(json.dumps(receita_complexa, indent=2))
    print()
    
    # Carrega e valida
    receita = carregador.carregar_receita_do_json(receita_complexa)
    erros = carregador.validar_receita(receita)
    
    if erros:
        print("❌ Erros na receita complexa:")
        for erro in erros:
            print(f"  - {erro}")
    else:
        print("✅ Receita complexa válida!")
        
        # Gera tags
        tags = carregador.gerar_tags_plc_para_receita(receita)
        print(f"\nTags geradas: {len(tags)} tags")
        
        # Mostra resumo por embaladora
        print("\nResumo por embaladora:")
        for emb in receita.configuracao:
            emb_tags = {k: v for k, v in tags.items() if emb.id in k}
            print(f"  {emb.id}: {len(emb_tags)} tags")
            for tag, valor in sorted(emb_tags.items()):
                if valor > 0:  # Só mostra tags com valor > 0
                    print(f"    {tag}: {valor}")

if __name__ == "__main__":
    testar_carregador()
    testar_receita_complexa()

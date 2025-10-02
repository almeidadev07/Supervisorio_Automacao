#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Carregador de Receitas para Sistema de Classificação
Implementa a lógica de carregamento de receitas e gravação no PLC
baseado no mapeamento fornecido pelo usuário.
"""

import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

# Configuração de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ClasseReceita:
    """Representa uma classe de ovo na receita"""
    id: str  # C1, C2, C3, C4, C5, C6, C7, CRACK, VISIO
    nome: str
    cor: str
    tipo: str  # branco, vermelho, misto

@dataclass
class EmbaladoraReceita:
    """Representa uma embaladora na receita"""
    id: str  # IND, E01, E02, ..., E24, SPJ
    nome: str
    classes: List[ClasseReceita]

@dataclass
class Receita:
    """Representa uma receita completa"""
    id: int
    nome: str
    configuracao: List[EmbaladoraReceita]
    data_criacao: str

class CarregadorReceitas:
    """Classe principal para carregamento e gravação de receitas no PLC"""
    
    def __init__(self):
        # Mapeamento de classes para P's (conforme especificado)
        self.class_to_p = {
            'C1': 'P1',
            'C2': 'P2', 
            'C3': 'P3',
            'C4': 'P4',
            'C5': 'P5',
            'C6': 'P6',
            'C7': 'P7',
            'CRACK': 'P9',
            'VISIO': 'P10'
        }
        
        # Mapeamento de embaladoras para posições (conforme especificado)
        self.embaladoras_order = ['IND'] + [f'E{i:02d}' for i in range(1, 25)] + ['SPJ']
        
        # Mapeamento de classes para bits no SPJ (conforme especificado)
        self.spj_class_to_bit = {
            'VISIO': 0,
            'CRACK': 15
        }
        # C1..C7 => bits 8..14
        for i in range(1, 8):
            self.spj_class_to_bit[f'C{i}'] = 7 + i

    def get_embaladora_bit_and_index(self, emb_id: str) -> Optional[Tuple[int, int]]:
        """
        Retorna (index, bit) para uma embaladora
        IND..E15 => [1], bits 0..15
        E16..SPJ => [0], bits reiniciam em 0
        """
        try:
            pos = self.embaladoras_order.index(emb_id)
            if pos <= 15:
                return (1, pos)  # [1], bits 0..15
            else:
                return (0, pos - 16)  # [0], bits reiniciam em 0
        except ValueError:
            return None

    def carregar_receita_do_json(self, json_data: Dict[str, Any]) -> Receita:
        """Carrega uma receita a partir de dados JSON"""
        try:
            configuracao = []
            for emb_data in json_data.get('configuracao', []):
                classes = []
                for classe_data in emb_data.get('classes', []):
                    classe = ClasseReceita(
                        id=classe_data['id'],
                        nome=classe_data['nome'],
                        cor=classe_data['cor'],
                        tipo=classe_data['tipo']
                    )
                    classes.append(classe)
                
                embaladora = EmbaladoraReceita(
                    id=emb_data['id'],
                    nome=emb_data['nome'],
                    classes=classes
                )
                configuracao.append(embaladora)
            
            receita = Receita(
                id=json_data['id'],
                nome=json_data['nome'],
                configuracao=configuracao,
                data_criacao=json_data.get('dataCriacao', '')
            )
            
            return receita
        except Exception as e:
            logger.error(f"Erro ao carregar receita do JSON: {e}")
            raise

    def gerar_tags_plc_para_receita(self, receita: Receita) -> Dict[str, int]:
        """
        Gera o mapeamento de tags PLC para uma receita
        Retorna dicionário com {tag: valor} para escrita no PLC
        """
        payload = {}
        
        # Processa cada embaladora da receita
        for embaladora in receita.configuracao:
            if embaladora.id == 'SPJ':
                # SPJ usa tags especiais de classes a ignorar
                self._processar_spj(payload, embaladora)
            else:
                # Embaladoras normais usam tags XLCLASS_DB200/DB201
                self._processar_embaladora_normal(payload, embaladora)
        
        return payload

    def _processar_spj(self, payload: Dict[str, int], embaladora: EmbaladoraReceita):
        """Processa embaladora SPJ (classes a ignorar)"""
        white_word = 0
        red_word = 0
        
        for classe in embaladora.classes:
            bit = self.spj_class_to_bit.get(classe.id)
            if bit is None:
                continue
                
            is_crack_visio = classe.id in ['CRACK', 'VISIO']
            
            if is_crack_visio:
                # CRACK/VISIO no SPJ só usa DB200 (misto)
                if classe.tipo == 'misto':
                    white_word = self._set_bit(white_word, bit, True)
                    red_word = self._set_bit(red_word, bit, False)
                else:
                    white_word = self._set_bit(white_word, bit, False)
                    red_word = self._set_bit(red_word, bit, False)
            else:
                # Classes normais C1-C7
                if classe.tipo == 'branco':
                    white_word = self._set_bit(white_word, bit, True)
                    red_word = self._set_bit(red_word, bit, False)
                elif classe.tipo == 'vermelho':
                    white_word = self._set_bit(white_word, bit, False)
                    red_word = self._set_bit(red_word, bit, True)
                elif classe.tipo == 'misto':
                    white_word = self._set_bit(white_word, bit, True)
                    red_word = self._set_bit(red_word, bit, True)
                else:
                    white_word = self._set_bit(white_word, bit, False)
                    red_word = self._set_bit(red_word, bit, False)
        
        payload['XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR'] = white_word
        payload['XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR'] = red_word

    def _processar_embaladora_normal(self, payload: Dict[str, int], embaladora: EmbaladoraReceita):
        """Processa embaladora normal (IND, E01-E24)"""
        mapping = self.get_embaladora_bit_and_index(embaladora.id)
        if not mapping:
            return
            
        index, bit = mapping
        
        # Inicializa palavras para todas as classes
        class_words = {}
        for class_id in self.class_to_p.keys():
            class_words[class_id] = {'white': 0, 'red': 0}
        
        # Processa classes da embaladora
        for classe in embaladora.classes:
            if classe.id not in self.class_to_p:
                continue
                
            p = self.class_to_p[classe.id]
            
            if classe.tipo == 'branco':
                class_words[classe.id]['white'] = self._set_bit(class_words[classe.id]['white'], bit, True)
                class_words[classe.id]['red'] = self._set_bit(class_words[classe.id]['red'], bit, False)
            elif classe.tipo == 'vermelho':
                class_words[classe.id]['white'] = self._set_bit(class_words[classe.id]['white'], bit, False)
                class_words[classe.id]['red'] = self._set_bit(class_words[classe.id]['red'], bit, True)
            elif classe.tipo == 'misto':
                class_words[classe.id]['white'] = self._set_bit(class_words[classe.id]['white'], bit, True)
                class_words[classe.id]['red'] = self._set_bit(class_words[classe.id]['red'], bit, True)
            else:
                class_words[classe.id]['white'] = self._set_bit(class_words[classe.id]['white'], bit, False)
                class_words[classe.id]['red'] = self._set_bit(class_words[classe.id]['red'], bit, False)
        
        # Adiciona tags ao payload
        for class_id, words in class_words.items():
            p = self.class_to_p[class_id]
            payload[f'XLCLASS_DB200_CLASSIFICACAO_{p}[{index}]'] = words['white']
            payload[f'XLCLASS_DB201_CLASSIFICACAO_{p}[{index}]'] = words['red']

    def _set_bit(self, word: int, bit_index: int, value: bool) -> int:
        """Define um bit específico em uma palavra"""
        if value:
            return word | (1 << bit_index)
        else:
            return word & ~(1 << bit_index)

    def carregar_receita_e_gravar_plc(self, receita_json: str, api_client) -> bool:
        """
        Carrega uma receita e grava no PLC
        receita_json: string JSON da receita
        api_client: cliente para comunicação com API do PLC
        """
        try:
            # Carrega receita do JSON
            receita_data = json.loads(receita_json)
            receita = self.carregar_receita_do_json(receita_data)
            
            # Gera tags para o PLC
            tags_plc = self.gerar_tags_plc_para_receita(receita)
            
            logger.info(f"Carregando receita: {receita.nome}")
            logger.info(f"Tags geradas: {len(tags_plc)} tags")
            
            # Grava no PLC
            sucesso = api_client.escrever_tags(tags_plc)
            
            if sucesso:
                logger.info(f"Receita '{receita.nome}' carregada com sucesso no PLC")
            else:
                logger.error(f"Falha ao carregar receita '{receita.nome}' no PLC")
            
            return sucesso
            
        except Exception as e:
            logger.error(f"Erro ao carregar receita: {e}")
            return False

    def criar_receita_exemplo(self) -> str:
        """Cria uma receita de exemplo para teste"""
        receita_exemplo = {
            "id": 1234567890,
            "nome": "Receita Exemplo",
            "configuracao": [
                {
                    "id": "E01",
                    "nome": "E01",
                    "classes": [
                        {
                            "id": "C1",
                            "nome": "C1",
                            "cor": "#FF3399",
                            "tipo": "branco"
                        },
                        {
                            "id": "C2",
                            "nome": "C2", 
                            "cor": "#FFFF00",
                            "tipo": "vermelho"
                        }
                    ]
                },
                {
                    "id": "E02",
                    "nome": "E02",
                    "classes": [
                        {
                            "id": "C3",
                            "nome": "C3",
                            "cor": "#0000FF",
                            "tipo": "misto"
                        }
                    ]
                },
                {
                    "id": "SPJ",
                    "nome": "SPJ",
                    "classes": [
                        {
                            "id": "CRACK",
                            "nome": "CRACK",
                            "cor": "#999999",
                            "tipo": "misto"
                        }
                    ]
                }
            ],
            "dataCriacao": "2024-01-01T00:00:00.000Z"
        }
        
        return json.dumps(receita_exemplo, indent=2)

    def validar_receita(self, receita: Receita) -> List[str]:
        """Valida uma receita e retorna lista de erros"""
        erros = []
        
        # Valida estrutura básica
        if not receita.nome or not receita.nome.strip():
            erros.append("Nome da receita não pode estar vazio")
        
        if not receita.configuracao:
            erros.append("Receita deve ter pelo menos uma embaladora configurada")
        
        # Valida embaladoras
        for embaladora in receita.configuracao:
            if embaladora.id not in self.embaladoras_order:
                erros.append(f"Embaladora '{embaladora.id}' não é válida")
            
            # Valida classes
            for classe in embaladora.classes:
                if classe.id not in self.class_to_p and classe.id not in self.spj_class_to_bit:
                    erros.append(f"Classe '{classe.id}' não é válida")
                
                if classe.tipo not in ['branco', 'vermelho', 'misto']:
                    erros.append(f"Tipo '{classe.tipo}' não é válido para classe '{classe.id}'")
        
        return erros

# Exemplo de uso
if __name__ == "__main__":
    carregador = CarregadorReceitas()
    
    # Cria receita de exemplo
    receita_json = carregador.criar_receita_exemplo()
    print("Receita de exemplo:")
    print(receita_json)
    
    # Carrega receita
    receita = carregador.carregar_receita_do_json(json.loads(receita_json))
    
    # Valida receita
    erros = carregador.validar_receita(receita)
    if erros:
        print("Erros na receita:")
        for erro in erros:
            print(f"- {erro}")
    else:
        print("Receita válida!")
    
    # Gera tags para PLC
    tags = carregador.gerar_tags_plc_para_receita(receita)
    print(f"\nTags geradas para PLC ({len(tags)} tags):")
    for tag, valor in sorted(tags.items()):
        print(f"  {tag}: {valor}")

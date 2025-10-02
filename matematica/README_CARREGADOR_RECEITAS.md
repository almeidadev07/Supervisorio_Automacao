# Sistema de Carregamento de Receitas

Este sistema implementa a lógica de carregamento de receitas e gravação no PLC conforme especificado pelo usuário.

## Arquivos

- `carregador_receitas.py` - Implementação Python do carregador
- `recipe_loader.js` - Implementação JavaScript para integração com o frontend
- `teste_carregador_receitas.py` - Testes do sistema
- `README_CARREGADOR_RECEITAS.md` - Esta documentação

## Funcionalidades

### 1. Carregamento de Receitas
- Carrega receitas a partir de dados JSON
- Valida estrutura e dados da receita
- Suporta todas as embaladoras: IND, E01-E24, SPJ
- Suporta todas as classes: C1-C7, CRACK, VISIO

### 2. Mapeamento para PLC
- Converte receitas para tags do PLC
- Implementa mapeamento conforme especificado:
  - **IND..E15**: `XLCLASS_DB200_CLASSIFICACAO_Px[1]` e `XLCLASS_DB201_CLASSIFICACAO_Px[1]`
  - **E16..SPJ**: `XLCLASS_DB200_CLASSIFICACAO_Px[0]` e `XLCLASS_DB201_CLASSIFICACAO_Px[0]`
  - **SPJ**: `XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR` e `XLCLASS_DB201_CLASSIFICACAO_CLASSES_A_IGNORAR`

### 3. Mapeamento de Classes
- **C1-C7**: Mapeiam para P1-P7
- **CRACK**: Mapeia para P9
- **VISIO**: Mapeia para P10

### 4. Mapeamento de Bits
- **IND..E15**: bits 0-15 no índice [1]
- **E16..SPJ**: bits 0-9 no índice [0]
- **SPJ classes**: bits especiais (VISIO=0, CRACK=15, C1-C7=8-14)

## Uso

### Python
```python
from carregador_receitas import CarregadorReceitas

# Cria carregador
carregador = CarregadorReceitas()

# Carrega receita do JSON
receita = carregador.carregar_receita_do_json(dados_json)

# Valida receita
erros = carregador.validar_receita(receita)

# Gera tags para PLC
tags = carregador.gerar_tags_plc_para_receita(receita)

# Carrega receita no PLC
sucesso = carregador.carregar_receita_e_gravar_plc(receita_json, api_client)
```

### JavaScript
```javascript
// O RecipeLoader é carregado automaticamente
const recipeLoader = new RecipeLoader();

// Valida receita
const erros = recipeLoader.validateRecipe(receita);

// Carrega receita no PLC
const sucesso = await recipeLoader.loadRecipeToPLC(receita, writeWordsFunction);
```

## Estrutura da Receita

```json
{
  "id": 1234567890,
  "nome": "Nome da Receita",
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
        }
      ]
    }
  ],
  "dataCriacao": "2024-01-01T00:00:00.000Z"
}
```

## Tipos de Classe
- `branco`: Apenas DB200 (branco)
- `vermelho`: Apenas DB201 (vermelho)  
- `misto`: Ambos DB200 e DB201

## Integração com Sistema Existente

O sistema foi integrado ao arquivo `classification.js` existente:

1. **Carregamento automático**: Quando uma receita é carregada, o sistema usa o `RecipeLoader`
2. **Fallback**: Se o `RecipeLoader` não estiver disponível, usa o método antigo
3. **Validação**: Valida receitas antes de carregar
4. **Logs**: Registra todas as operações para debug

## Testes

Execute o teste para verificar o funcionamento:

```bash
cd matematica
python teste_carregador_receitas.py
```

## Exemplo de Saída

O sistema gera tags como:
- `XLCLASS_DB200_CLASSIFICACAO_P1[1]`: 1 (C1 branco na E01)
- `XLCLASS_DB201_CLASSIFICACAO_P2[1]`: 2 (C2 vermelho na E01)
- `XLCLASS_DB200_CLASSIFICACAO_CLASSES_A_IGNORAR`: 32768 (CRACK misto no SPJ)

## Mapeamento Detalhado

### Embaladoras
- **IND**: posição 0 → index=1, bit=0
- **E01**: posição 1 → index=1, bit=1
- **E15**: posição 15 → index=1, bit=15
- **E16**: posição 16 → index=0, bit=0
- **E24**: posição 24 → index=0, bit=8
- **SPJ**: posição 25 → index=0, bit=9

### Classes SPJ
- **VISIO**: bit 0
- **C1**: bit 8
- **C2**: bit 9
- **C3**: bit 10
- **C4**: bit 11
- **C5**: bit 12
- **C6**: bit 13
- **C7**: bit 14
- **CRACK**: bit 15

## Troubleshooting

1. **Receita inválida**: Verifique se todas as embaladoras e classes são válidas
2. **Tags não geradas**: Verifique se a receita tem configurações válidas
3. **Erro de carregamento**: Verifique se o `RecipeLoader` está carregado no navegador
4. **Fallback ativado**: Verifique o console para mensagens de fallback

# Gerador de Conversões WORD -> BOOL

## 📁 Estrutura
```
matematica/
├── gerador_simples.py    # Script principal
└── README.md            # Este arquivo

alarmes/                 # Pasta com descrições (gerada automaticamente)
└── *_descricoes.txt     # Arquivos de descrições dos índices
```

## 🚀 Como Usar

### 1. Executar o Gerador
```bash
python matematica/gerador_simples.py
```

### 2. Resultado
- **Pasta matematica/**: Arquivos de conversão WORD -> BOOL (um por alarme)
- **Pasta alarmes/**: Arquivos com descrições dos índices (um por alarme)

### 3. Adicionar Novos Alarmes
1. Adicione os novos alarmes nos arquivos `config/comm_map/*.json`
2. Execute o gerador novamente
3. Os novos arquivos serão criados automaticamente

## 📝 Exemplo de Saída

### Arquivo de Conversão (matematica/)
```plc
// Declaração da variável BOOL
BOOL DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS_BOOL[16]

// Conversões dos bits
DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS_BOOL[0] = XLCLASS_DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS.B0
DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS_BOOL[1] = XLCLASS_DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS.B1
// ... até o bit 15
```

### Arquivo de Descrições (alarmes/)
```plc
// [ 0] DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS_BOOL[0] = Alarme Alto Principal - Bit 0
// [ 1] DB1_PRINCIPAL_ALARMES_ALTO_PRINCIPAIS_BOOL[1] = Alarme Alto Principal - Bit 1
// ... etc
```

## ✅ Pronto para Usar!
O sistema está limpo e otimizado para adicionar novos alarmes facilmente.

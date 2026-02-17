import re
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parents[1] / 'alarmes'

ARRAY_RE = re.compile(r"^//\s*\[\s*(\d+)\s*\]\s*([A-Z0-9_]+?)(?:_(?:BOOL|BIT))?\s*\[\s*(\d+)\s*\]\s*=\s*(.*)$")
BIT_RE   = re.compile(r"^//\s*([A-Z0-9_\.]+)\.B(\d+)\s*=\s*(.*)$")


def convert_file(path: Path) -> bool:
    text = path.read_text(encoding='utf-8', errors='ignore')
    lines = text.splitlines()

    # base -> {bitIndex: description}
    mapping: Dict[str, Dict[int, str]] = {}
    order = []

    for line in lines:
        s = line.strip()
        m1 = ARRAY_RE.match(s)
        if m1:
            _shown, base, idx, desc = m1.groups()
            base = base.replace('_BOOL', '').replace('_BIT', '')
            idx = int(idx)
            mapping.setdefault(base, {})[idx] = (desc or '').strip()
            if base not in order:
                order.append(base)
            continue

        m2 = BIT_RE.match(s)
        if m2:
            tag, idx, desc = m2.groups()
            base = tag.strip()
            idx = int(idx)
            mapping.setdefault(base, {})[idx] = (desc or '').strip()
            if base not in order:
                order.append(base)
            continue

    if not mapping:
        return False

    # Reescreve removendo linhas antigas e cabeçalhos `Array:`/índice
    out = []
    skip_example = False
    for i, line in enumerate(lines):
        s = line.strip()
        if not skip_example and s.startswith('// ========================================'):
            next_line = lines[i + 1].strip() if i + 1 < len(lines) else ''
            if next_line.lower().startswith('// exemplo de uso'):
                skip_example = True
                continue
        if s.lower().startswith('// exemplo de uso'):
            skip_example = True
            continue
        if skip_example:
            if s.startswith('// ========================================'):
                skip_example = False
            continue
        if ARRAY_RE.match(s):
            continue
        if BIT_RE.match(s):
            continue
        if s.lower().startswith('// array:'):
            continue
        if s.lower().startswith('// bits:'):
            continue
        if s.lower().startswith('// cada índice') or s.lower().startswith('// cada indice'):
            continue
        # Ajusta cabeçalho, se existir
        if "DESCRIÇÕES DOS ÍNDICES" in line:
            line = line.replace("DESCRIÇÕES DOS ÍNDICES", "DESCRIÇÕES DOS BITS")
        if "DESCRICOES DOS INDICES" in line:
            line = line.replace("DESCRICOES DOS INDICES", "DESCRICOES DOS BITS")
        out.append(line)

    if out and out[-1].strip() != '':
        out.append('')

    # Ordem direta: B0..B15
    for base in order:
        bits = mapping.get(base, {})
        out.append(f"// Bits: {base}.B0 .. {base}.B15")
        for i in range(0, 16):
            if i in bits:
                out.append(f"// {base}.B{i} = {bits[i]}")
        out.append('')

    new_text = "\n".join(out).rstrip() + "\n"
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        return True
    return False


def main():
    updated = []
    for p in sorted(ROOT.glob('*_descricoes.txt')):
        try:
            if convert_file(p):
                updated.append(p.name)
        except Exception:
            continue
    print('Atualizados:')
    for n in updated:
        print(n)


if __name__ == '__main__':
    main()

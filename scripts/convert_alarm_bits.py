import re
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parents[1] / 'alarmes'

ARRAY_RE = re.compile(r"^//\s*\[(\d+)\]\s*([A-Z0-9_]+?)(?:_(?:BOOL|BIT))?\[(\d+)\]\s*=\s*(.*)$")
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

    # Reescreve removendo linhas antigas e cabeçalhos `Array:`
    out = []
    for line in lines:
        s = line.strip()
        if ARRAY_RE.match(s):
            continue
        if BIT_RE.match(s):
            continue
        if s.lower().startswith('// array:'):
            continue
        out.append(line)

    if out and out[-1].strip() != '':
        out.append('')

    # Ordem rotacionária: B8..B15, B0..B7
    for base in order:
        bits = mapping.get(base, {})
        out.append(f"// Bits: {base}.B0 .. {base}.B15")
        for i in list(range(8, 16)) + list(range(0, 8)):
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



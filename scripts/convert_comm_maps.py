import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMM_DIR = ROOT / 'config' / 'comm_map'
FILES = [COMM_DIR / '200CX.json', COMM_DIR / '400CX.json', COMM_DIR / '700CX.json']


def build_grouped_by_db(items):
	grouped = {}
	for e in items:
		if not isinstance(e, dict):
			continue
		if e.get('__section__'):
			continue
		if e.get('area') != 'DB':
			continue
		db = e.get('db')
		offset = e.get('offset')
		type_ = e.get('type')
		name = e.get('name')
		if not name or not isinstance(db, int) or not isinstance(offset, (int, float)) or not type_:
			continue
        item = {
            'name': name,
            'start': int(offset),
            'type': str(type_).upper(),
        }
        # Preserva byte/bit se existirem (fundamental para BOOL)
        if 'byte' in e:
            item['byte'] = int(e.get('byte'))
        if 'bit' in e:
            item['bit'] = int(e.get('bit'))
        grouped.setdefault(str(db), []).append(item)
	# ordena por start dentro de cada DB
	for db, arr in grouped.items():
		arr.sort(key=lambda x: x['start'])
	return grouped


def convert_file(path: Path, in_place: bool = True):
	if not path.exists():
		print(f'[skip] não encontrado: {path}')
		return False
	text = path.read_text(encoding='utf-8')
	try:
		data = json.loads(text)
	except Exception as e:
		print(f'[erro] JSON inválido em {path}: {e}')
		return False
	items = data if isinstance(data, list) else (data.get('items') if isinstance(data, dict) else [])
	if not isinstance(items, list):
		print(f'[skip] formato inesperado em {path}')
		return False
	grouped = build_grouped_by_db(items)
	out_text = json.dumps(grouped, ensure_ascii=False, indent=2)
	if in_place:
		# backup
		bak = path.with_suffix(path.suffix + '.bak')
		if not bak.exists():
			bak.write_text(text, encoding='utf-8')
		path.write_text(out_text + '\n', encoding='utf-8')
		print(f'[ok] convertido: {path} (backup: {bak.name})')
	else:
		out = path.with_name(path.stem + '_grouped.json')
		out.write_text(out_text + '\n', encoding='utf-8')
		print(f'[ok] gerado: {out}')
	return True


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument('--no-in-place', action='store_true', help='não sobrescrever; gerar *_grouped.json')
	args = ap.parse_args()
	ok = True
	for f in FILES:
		ok = convert_file(f, in_place=not args.no_in_place) and ok
	return 0 if ok else 1


if __name__ == '__main__':
	exit(main())

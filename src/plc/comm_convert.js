/* eslint-disable */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCommMapPath } from './utils.js';
import { buildGroupedByDb } from './plcPolling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function mapToObject(map) {
	const obj = {};
	for (const [k, v] of map.entries()) {
		obj[k] = v; // chaves numéricas serão serializadas como strings em JSON
	}
	return obj;
}

function main() {
	const srcPath = resolveCommMapPath();
	const raw = fs.readFileSync(srcPath, 'utf-8');
	const data = JSON.parse(raw);
	const arr = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
	const grouped = buildGroupedByDb(arr);
	const outObj = mapToObject(grouped);
	const outPath = path.join(__dirname, 'comm_map_grouped.json');
	fs.writeFileSync(outPath, JSON.stringify(outObj, null, 2), 'utf-8');
	console.log(`Gerado: ${outPath}`);
	console.log(`DBs: ${Object.keys(outObj).length}`);
}

main();

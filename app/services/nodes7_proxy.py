import json
import os
import threading
import time
import urllib.parse
import urllib.request
from typing import Dict, Iterable, Optional
from urllib.error import URLError


class NodeS7Proxy:
    """Adaptador leve para o servidor NodeS7 exposto em `src/server.js`.

    A maioria das rotas do Flask espera um controlador com a mesma interface
    do controlador Python tradicional. Implementamos aqui um subconjunto das
    funcionalidades necessárias para leitura, escrita e gestão simples de
    subscrições, delegando as leituras/escritas ao servidor Node.
    """

    def __init__(self) -> None:
        port = int(os.environ.get('WS_PORT') or os.environ.get('NODE_S7_PORT', 8081))
        host = os.environ.get('NODE_S7_HOST', '127.0.0.1')
        self.base_url = f"http://{host}:{port}"

        # Compatibilidade com o restante do código
        self.active_config: Optional[Dict[str, str]] = None
        self._subscription_lock = threading.Lock()
        self._active_subscriptions: Dict[str, Dict[str, object]] = {}
        self._heartbeat_timeout = 30.0

    # ---------------------- utilidades internas -------------------------
    def _do_request(self, url: str, *, data: Optional[bytes] = None, method: str = 'GET', timeout: float = 5.0) -> Optional[Dict[str, object]]:
        request = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            request.add_header('Content-Type', 'application/json')

        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    payload = response.read().decode('utf-8')
                    return json.loads(payload or '{}')
            except URLError:
                time.sleep(0.2 * (attempt + 1))
            except Exception:
                break
        return None

    def _collect_subscribed_tags(self) -> Iterable[str]:
        with self._subscription_lock:
            for entry in self._active_subscriptions.values():
                tags = entry.get('tags')
                if isinstance(tags, list):
                    for tag in tags:
                        yield tag

    def _prune_expired(self) -> None:
        cutoff = time.time() - self._heartbeat_timeout
        with self._subscription_lock:
            expired = [cid for cid, info in self._active_subscriptions.items() if info.get('last_heartbeat', 0) < cutoff]
            for cid in expired:
                self._active_subscriptions.pop(cid, None)

    # ----------------------- interface pública ------------------------
    def read_tags(self, tag_names: Optional[Iterable[str]]) -> Dict[str, object]:
        names = [t for t in (tag_names or []) if t]
        if not names:
            return {}

        query = urllib.parse.urlencode({'tags': ','.join(names)})
        url = f"{self.base_url}/api/read?{query}"
        result = self._do_request(url)
        data = (result or {}).get('data')
        out = data if isinstance(data, dict) else {}

        # Alguns valores podem não ser retornados na leitura direta; tentamos preencher via snapshot
        missing = [name for name in names if name not in out]
        if missing:
            snapshot = self._do_request(f"{self.base_url}/api/snapshot")
            snap_data = (snapshot or {}).get('data')
            if isinstance(snap_data, dict):
                for name in missing:
                    if name in snap_data:
                        out[name] = snap_data[name]
        return out

    def write_tags(self, values: Dict[str, object]) -> bool:
        if not values:
            return True
        payload = json.dumps({'values': values}).encode('utf-8')
        url = f"{self.base_url}/api/write"
        result = self._do_request(url, data=payload, method='POST')
        return bool(result and result.get('ok'))

    def subscribe_tags(self, client_id: str, tag_names: Iterable[str]) -> bool:
        tag_list = [t for t in (tag_names or []) if t]
        with self._subscription_lock:
            self._active_subscriptions[client_id] = {
                'tags': tag_list,
                'last_heartbeat': time.time(),
            }
        return True

    def unsubscribe_client(self, client_id: str) -> bool:
        with self._subscription_lock:
            return self._active_subscriptions.pop(client_id, None) is not None

    def heartbeat_client(self, client_id: str) -> bool:
        with self._subscription_lock:
            entry = self._active_subscriptions.get(client_id)
            if not entry:
                return False
            entry['last_heartbeat'] = time.time()
        return True

    def get_subscribed_tags(self) -> list:
        self._prune_expired()
        return list(dict.fromkeys(self._collect_subscribed_tags()))

    def set_active_machine(self, cfg: Dict[str, object]):
        self.active_config = cfg
        # O NodeS7 é reiniciado pelo Flask ao trocar de máquina; aqui apenas guardamos a configuração
        return True, f"Máquina {cfg.get('name')} configurada (proxy)"

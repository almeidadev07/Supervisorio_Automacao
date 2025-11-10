# app/plc_drivers/opcua.py
import threading
from typing import Any, Dict, List, Optional

from .base import BasePLC

try:
    from opcua import Client
    HAS_OPCUA = True
except Exception:
    HAS_OPCUA = False


class OpcUaDriver(BasePLC):
    """
    Driver OPC UA básico que implementa a interface BasePLC.

    Requisitos de configuração (em config da máquina):
    - default_plc_ip: IP do servidor OPC UA
    - opcua_endpoint (opcional): endpoint completo (ex.: opc.tcp://IP:4840)
    - comm_map: lista de tags com campo 'name' e 'nodeId' (ou 'node_id')
    """

    def __init__(self, ip: str, config: Dict[str, Any]):
        super().__init__(ip, config)
        if not HAS_OPCUA:
            raise RuntimeError('python-opcua (opcua) não instalado')
        self._client: Optional[Client] = None
        self._lock = threading.RLock()
        self._connected = False
        self._ns_array: List[str] = []

    def _build_endpoint(self) -> str:
        endpoint = self.config.get('opcua_endpoint')
        if endpoint:
            return endpoint
        return f"opc.tcp://{self.ip}:4840"

    def connect(self) -> bool:
        with self._lock:
            try:
                endpoint = self._build_endpoint()
                self._client = Client(endpoint)
                # Opcional: alguns servidores exigem SecurityPolicy/Mode; manter simples inicialmente
                self._client.connect()
                # Captura namespaces disponíveis para detecção automática
                try:
                    self._ns_array = self._client.get_namespace_array() or []
                except Exception:
                    self._ns_array = []
                self._connected = True
                print(f"[OPC UA] ✅ Conectado a {endpoint}")
                return True
            except Exception as e:
                print(f"[OPC UA] ❌ Falha ao conectar: {e}")
                self._client = None
                self._connected = False
                return False

    def disconnect(self):
        with self._lock:
            try:
                if self._client is not None:
                    self._client.disconnect()
            except Exception:
                pass
            finally:
                self._client = None
                self._connected = False
                self._ns_array = []

    def is_connected(self) -> bool:
        with self._lock:
            return bool(self._connected and self._client is not None)

    def read_telemetry(self) -> Dict[str, Any]:
        return {'source': 'opcua', 'connected': self.is_connected()}

    def _get_comm_map(self) -> List[Dict[str, Any]]:
        comm_map = self.config.get('comm_map') or []
        if not isinstance(comm_map, list):
            return []
        return [t for t in comm_map if isinstance(t, dict) and t.get('name')]

    def _node_id_from_tag(self, tag_def: Dict[str, Any]) -> Optional[str]:
        # Preferência por nodeId explícito
        node_id = tag_def.get('nodeId') or tag_def.get('node_id') or tag_def.get('node')
        if node_id:
            return node_id
        # Fallback: construir a partir do nome usando namespace configurável (default 2)
        name = tag_def.get('name')
        if not name:
            return None
        ns_index = self._preferred_ns_index()
        return f"ns={ns_index};s={name}"

    def _preferred_ns_index(self) -> int:
        try:
            return int(self.config.get('opcua_ns', 2))
        except Exception:
            return 2

    def _candidate_ns_indexes(self) -> List[int]:
        """Gera candidatos de namespace para tentar (configurado + todos do servidor)."""
        candidates = []
        configured = self._preferred_ns_index()
        candidates.append(configured)
        # Acrescenta todos os índices conhecidos do servidor
        try:
            for idx in range(len(self._ns_array)):
                if idx not in candidates:
                    candidates.append(idx)
        except Exception:
            pass
        # Acrescenta alguns comuns por garantia
        for common in (2, 3, 4):
            if common not in candidates:
                candidates.append(common)
        return candidates

    def read_tags(self, tag_definitions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Lê tags via OPC UA.
        Espera que cada tag_def contenha 'name' e 'nodeId' (ou 'node_id'/'node').
        """
        if not tag_definitions:
            return {}
        with self._lock:
            if not self.is_connected():
                if not self.connect():
                    return {}
            client = self._client
        if client is None:
            return {}

        values: Dict[str, Any] = {}
        for tag in tag_definitions:
            try:
                name = tag.get('name')
                node_id = self._node_id_from_tag(tag)
                if not name:
                    continue
                # Tenta com nodeId explícito
                if node_id:
                    try:
                        node = client.get_node(node_id)
                        values[name] = node.get_value()
                        continue
                    except Exception:
                        # Cai para tentativa por namespaces
                        pass
                # Tenta múltiplos namespaces com base no nome
                read_ok = False
                for ns_idx in self._candidate_ns_indexes():
                    try:
                        nid = f"ns={ns_idx};s={name}"
                        node = client.get_node(nid)
                        values[name] = node.get_value()
                        read_ok = True
                        break
                    except Exception:
                        continue
                if not read_ok:
                    values[name] = None
            except Exception as e:
                print(f"[OPC UA] ❌ Erro ao ler {tag.get('name')}: {e}")
                values[tag.get('name')] = None
        return values

    def write_tags(self, tag_values: Dict[str, Any]) -> bool:
        """
        Escreve valores via OPC UA.
        Resolve NodeIds a partir do comm_map configurado (name -> nodeId).
        """
        if not tag_values:
            return True
        with self._lock:
            if not self.is_connected():
                if not self.connect():
                    return False
            client = self._client
        if client is None:
            return False

        comm_map = self._get_comm_map()
        name_to_node: Dict[str, str] = {}
        for t in comm_map:
            nid = self._node_id_from_tag(t)
            if nid:
                name_to_node[t['name']] = nid

        try:
            for name, value in tag_values.items():
                node_id = name_to_node.get(name)
                # Escreve primeiro com nodeId explícito, se houver
                if node_id:
                    try:
                        node = client.get_node(node_id)
                        node.set_value(value)
                        continue
                    except Exception:
                        pass
                # Tenta múltiplos namespaces com base no nome
                write_ok = False
                for ns_idx in self._candidate_ns_indexes():
                    try:
                        nid = f"ns={ns_idx};s={name}"
                        node = client.get_node(nid)
                        node.set_value(value)
                        write_ok = True
                        break
                    except Exception:
                        continue
                if not write_ok:
                    raise KeyError(f"NodeId não encontrado no servidor para tag: {name}")
            return True
        except Exception as e:
            print(f"[OPC UA] ❌ Erro ao escrever tags: {e}")
            return False

    # Utilitário opcional para navegação
    def browse(self, max_nodes: int = 200, contains: Optional[str] = None, parent: Optional[str] = None, recursive: bool = True) -> List[Dict[str, Any]]:
        with self._lock:
            if not self.is_connected():
                if not self.connect():
                    return []
            client = self._client
        if client is None:
            return []
        result: List[Dict[str, Any]] = []
        try:
            start_node = None
            if parent:
                start_node = client.get_node(parent)
            if start_node is None:
                root = client.get_root_node()
                start_node = root.get_child(["0:Objects"])  # type: ignore
            # DFS ou apenas um nível
            stack = [start_node]
            seen = set()
            while stack and len(result) < max_nodes:
                node = stack.pop()
                try:
                    node_id = node.nodeid.to_string()
                    if node_id in seen:
                        continue
                    seen.add(node_id)
                    dn = None
                    try:
                        dn = node.get_display_name().Text  # type: ignore
                    except Exception:
                        dn = None
                    entry = {"nodeId": node_id, "displayName": dn}
                    if (contains is None) or (dn and contains.lower() in dn.lower()) or (contains and contains in node_id):
                        result.append(entry)
                    # push children
                    try:
                        children = node.get_children()
                        if recursive:
                            for child in children:
                                stack.append(child)
                        else:
                            # apenas um nível
                            for child in children:
                                try:
                                    cid = child.nodeid.to_string()
                                    cdn = None
                                    try:
                                        cdn = child.get_display_name().Text  # type: ignore
                                    except Exception:
                                        cdn = None
                                    centry = {"nodeId": cid, "displayName": cdn}
                                    if (contains is None) or (cdn and contains.lower() in cdn.lower()) or (contains and contains in cid):
                                        result.append(centry)
                                except Exception:
                                    continue
                    except Exception:
                        pass
                except Exception:
                    continue
        except Exception:
            pass
        return result

    def read_node_value(self, node_id: str) -> Any:
        with self._lock:
            if not self.is_connected():
                if not self.connect():
                    raise RuntimeError('OPC UA não conectado')
            client = self._client
        if client is None:
            raise RuntimeError('Cliente OPC UA indisponível')
        node = client.get_node(node_id)
        return node.get_value()



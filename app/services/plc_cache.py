# app/services/plc_cache.py
import threading
import time
from typing import Dict, Any, Optional, List, Set
from dataclasses import dataclass
from collections import defaultdict

@dataclass
class CacheEntry:
    """Entrada do cache com valor e metadados"""
    value: Any
    timestamp: float
    access_count: int = 0
    last_access: float = 0.0
    ttl: float = 30.0  # Time to live em segundos
    
    def is_expired(self) -> bool:
        """Verifica se a entrada expirou"""
        return time.time() - self.timestamp > self.ttl
    
    def is_stale(self, max_age: float = 5.0) -> bool:
        """Verifica se a entrada está desatualizada"""
        return time.time() - self.timestamp > max_age
    
    def touch(self):
        """Atualiza timestamp de último acesso"""
        self.last_access = time.time()
        self.access_count += 1

class PLCCache:
    """
    Camada de Cache para Dados de PLC
    
    Responsável por:
    - Armazenar últimos valores lidos de cada tag
    - Evitar leituras repetidas se valor não mudou
    - Gerenciar TTL e limpeza automática
    - Detectar mudanças de valor para otimizar envios
    - Estatísticas de hit/miss do cache
    """
    
    def __init__(self, default_ttl: float = 30.0, max_size: int = 10000):
        self.default_ttl = default_ttl
        self.max_size = max_size
        
        # Cache principal
        self._cache = {}  # {tag_name: CacheEntry}
        self._lock = threading.RLock()
        
        # Configurações de limpeza
        self._cleanup_interval = 60.0  # Limpeza a cada 60s
        self._cleanup_thread = None
        self._stop_cleanup = threading.Event()
        
        # Estatísticas
        self._stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'evictions': 0,
            'expired_entries': 0,
            'stale_entries': 0
        }
        
        # Configurações de mudança de valor
        self._change_thresholds = {
            'REAL': 0.01,      # 1% de mudança para floats
            'WORD': 1,         # 1 unidade para inteiros
            'DWORD': 1,        # 1 unidade para inteiros longos
            'BOOL': 0,         # Qualquer mudança para booleanos
            'default': 0.01    # 1% para outros tipos
        }
        
        # Callbacks
        self._on_value_changed: Optional[callable] = None
        self._on_cache_eviction: Optional[callable] = None
        
        # Inicia thread de limpeza
        self._start_cleanup_thread()
    
    def _start_cleanup_thread(self):
        """Inicia thread de limpeza automática"""
        self._stop_cleanup.clear()
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="PLCCacheCleanup"
        )
        self._cleanup_thread.start()
        print("[CACHE] 🧹 Thread de limpeza iniciada")
    
    def _cleanup_loop(self):
        """Loop de limpeza automática"""
        while not self._stop_cleanup.is_set():
            try:
                self._cleanup_expired_entries()
                time.sleep(self._cleanup_interval)
            except Exception as e:
                print(f"[CACHE] ❌ Erro na limpeza: {e}")
                time.sleep(10.0)
    
    def _cleanup_expired_entries(self):
        """Remove entradas expiradas do cache"""
        current_time = time.time()
        expired_tags = []
        
        with self._lock:
            for tag_name, entry in self._cache.items():
                if entry.is_expired():
                    expired_tags.append(tag_name)
        
        if expired_tags:
            for tag_name in expired_tags:
                self._remove_entry(tag_name)
            
            with self._lock:
                self._stats['expired_entries'] += len(expired_tags)
            
            print(f"[CACHE] 🗑️ Removidas {len(expired_tags)} entradas expiradas")
    
    def set_callbacks(self, on_value_changed=None, on_cache_eviction=None):
        """Define callbacks para notificações"""
        self._on_value_changed = on_value_changed
        self._on_cache_eviction = on_cache_eviction
    
    def get(self, tag_name: str, tag_type: str = None) -> Optional[Any]:
        """Obtém valor do cache"""
        with self._lock:
            entry = self._cache.get(tag_name)
            
            if entry is None:
                self._stats['misses'] += 1
                return None
            
            # Verifica se expirou
            if entry.is_expired():
                del self._cache[tag_name]
                self._stats['misses'] += 1
                self._stats['expired_entries'] += 1
                return None
            
            # Atualiza estatísticas de acesso
            entry.touch()
            self._stats['hits'] += 1
            
            return entry.value
    
    def set(self, tag_name: str, value: Any, tag_type: str = None, ttl: float = None) -> bool:
        """Define valor no cache"""
        try:
            with self._lock:
                # Verifica se precisa evictar entradas
                if len(self._cache) >= self.max_size:
                    self._evict_oldest_entries()
                
                # Cria nova entrada
                entry = CacheEntry(
                    value=value,
                    timestamp=time.time(),
                    ttl=ttl or self.default_ttl
                )
                
                # Verifica se houve mudança significativa
                old_entry = self._cache.get(tag_name)
                if old_entry and not self._has_significant_change(old_entry.value, value, tag_type):
                    # Valor não mudou significativamente - atualiza apenas timestamp
                    old_entry.timestamp = entry.timestamp
                    return False
                
                # Armazena nova entrada
                self._cache[tag_name] = entry
                self._stats['sets'] += 1
                
                # Notifica mudança de valor
                if old_entry is not None:
                    self._notify_value_changed(tag_name, old_entry.value, value)
                
                return True
                
        except Exception as e:
            print(f"[CACHE] ❌ Erro ao definir valor para {tag_name}: {e}")
            return False
    
    def set_multiple(self, tag_values: Dict[str, Any], tag_types: Dict[str, str] = None) -> Dict[str, bool]:
        """Define múltiplos valores no cache"""
        results = {}
        
        for tag_name, value in tag_values.items():
            tag_type = tag_types.get(tag_name) if tag_types else None
            results[tag_name] = self.set(tag_name, value, tag_type)
        
        return results
    
    def get_multiple(self, tag_names: List[str]) -> Dict[str, Any]:
        """Obtém múltiplos valores do cache"""
        results = {}
        
        for tag_name in tag_names:
            value = self.get(tag_name)
            if value is not None:
                results[tag_name] = value
        
        return results
    
    def _has_significant_change(self, old_value: Any, new_value: Any, tag_type: str = None) -> bool:
        """Verifica se houve mudança significativa no valor"""
        # Valores None sempre são considerados mudança
        if old_value is None or new_value is None:
            return old_value != new_value
        
        # Valores iguais não são mudança
        if old_value == new_value:
            return False
        
        # Para booleanos, qualquer mudança é significativa
        if isinstance(old_value, bool) or isinstance(new_value, bool):
            return old_value != new_value
        
        # Para números, verifica threshold
        if isinstance(old_value, (int, float)) and isinstance(new_value, (int, float)):
            threshold = self._change_thresholds.get(tag_type, self._change_thresholds['default'])
            
            if threshold == 0:
                return old_value != new_value
            
            # Calcula percentual de mudança
            if old_value == 0:
                return new_value != 0
            
            change_percent = abs(new_value - old_value) / abs(old_value)
            return change_percent >= threshold
        
        # Para outros tipos, qualquer mudança é significativa
        return True
    
    def _evict_oldest_entries(self, count: int = 100):
        """Remove entradas mais antigas do cache"""
        with self._lock:
            if len(self._cache) < count:
                count = len(self._cache)
            
            # Ordena por timestamp (mais antigas primeiro)
            sorted_entries = sorted(
                self._cache.items(),
                key=lambda x: x[1].timestamp
            )
            
            # Remove as mais antigas
            for i in range(count):
                tag_name, _ = sorted_entries[i]
                self._remove_entry(tag_name)
            
            self._stats['evictions'] += count
            print(f"[CACHE] 🗑️ Evictadas {count} entradas antigas")
    
    def _remove_entry(self, tag_name: str):
        """Remove entrada específica do cache"""
        if tag_name in self._cache:
            del self._cache[tag_name]
            
            if self._on_cache_eviction:
                try:
                    self._on_cache_eviction(tag_name)
                except Exception as e:
                    print(f"[CACHE] ❌ Erro no callback de eviction: {e}")
    
    def _notify_value_changed(self, tag_name: str, old_value: Any, new_value: Any):
        """Notifica mudança de valor"""
        if self._on_value_changed:
            try:
                self._on_value_changed(tag_name, old_value, new_value)
            except Exception as e:
                print(f"[CACHE] ❌ Erro no callback de mudança de valor: {e}")
    
    def invalidate(self, tag_name: str):
        """Invalida entrada específica do cache"""
        with self._lock:
            if tag_name in self._cache:
                del self._cache[tag_name]
                print(f"[CACHE] 🗑️ Entrada {tag_name} invalidada")
    
    def invalidate_multiple(self, tag_names: List[str]):
        """Invalida múltiplas entradas do cache"""
        with self._lock:
            for tag_name in tag_names:
                if tag_name in self._cache:
                    del self._cache[tag_name]
            print(f"[CACHE] 🗑️ {len(tag_names)} entradas invalidadas")
    
    def invalidate_pattern(self, pattern: str):
        """Invalida entradas que correspondem ao padrão"""
        import re
        
        with self._lock:
            invalidated = []
            for tag_name in list(self._cache.keys()):
                if re.search(pattern, tag_name):
                    del self._cache[tag_name]
                    invalidated.append(tag_name)
            
            if invalidated:
                print(f"[CACHE] 🗑️ {len(invalidated)} entradas invalidadas (padrão: {pattern})")
    
    def clear(self):
        """Limpa todo o cache"""
        with self._lock:
            self._cache.clear()
            print("[CACHE] 🗑️ Cache limpo completamente")
    
    def get_stale_entries(self, max_age: float = 5.0) -> List[str]:
        """Retorna lista de entradas desatualizadas"""
        stale_entries = []
        current_time = time.time()
        
        with self._lock:
            for tag_name, entry in self._cache.items():
                if entry.is_stale(max_age):
                    stale_entries.append(tag_name)
        
        return stale_entries
    
    def get_cache_size(self) -> int:
        """Retorna tamanho atual do cache"""
        with self._lock:
            return len(self._cache)
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do cache"""
        with self._lock:
            stats = self._stats.copy()
        
        stats['cache_size'] = len(self._cache)
        stats['hit_rate'] = self._calculate_hit_rate()
        stats['memory_usage'] = self._estimate_memory_usage()
        
        return stats
    
    def _calculate_hit_rate(self) -> float:
        """Calcula taxa de hit do cache"""
        total_requests = self._stats['hits'] + self._stats['misses']
        if total_requests == 0:
            return 0.0
        return self._stats['hits'] / total_requests
    
    def _estimate_memory_usage(self) -> int:
        """Estima uso de memória do cache em bytes"""
        import sys
        
        total_size = 0
        for entry in self._cache.values():
            total_size += sys.getsizeof(entry.value)
            total_size += sys.getsizeof(entry)
        
        return total_size
    
    def get_most_accessed(self, limit: int = 10) -> List[tuple]:
        """Retorna entradas mais acessadas"""
        with self._lock:
            sorted_entries = sorted(
                self._cache.items(),
                key=lambda x: x[1].access_count,
                reverse=True
            )
            return sorted_entries[:limit]
    
    def get_least_accessed(self, limit: int = 10) -> List[tuple]:
        """Retorna entradas menos acessadas"""
        with self._lock:
            sorted_entries = sorted(
                self._cache.items(),
                key=lambda x: x[1].access_count
            )
            return sorted_entries[:limit]
    
    def set_ttl(self, tag_name: str, ttl: float):
        """Define TTL específico para uma tag"""
        with self._lock:
            if tag_name in self._cache:
                self._cache[tag_name].ttl = ttl
    
    def set_ttl_multiple(self, tag_ttls: Dict[str, float]):
        """Define TTL para múltiplas tags"""
        with self._lock:
            for tag_name, ttl in tag_ttls.items():
                if tag_name in self._cache:
                    self._cache[tag_name].ttl = ttl
    
    def cleanup(self):
        """Limpeza completa - para threads e limpa cache"""
        # Para thread de limpeza
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            self._stop_cleanup.set()
            self._cleanup_thread.join(timeout=2)
        
        # Limpa cache
        self.clear()
        
        print("[CACHE] 🧹 Cleanup completo realizado")

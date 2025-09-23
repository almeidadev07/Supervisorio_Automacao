# app/services/tag_subscription_manager.py
import threading
import time
import json
import os
from typing import Dict, List, Set, Optional, Callable
from collections import defaultdict

class TagSubscriptionManager:
    """
    Gerenciador de Subscrições de Tags por Tela
    
    Responsável por:
    - Manter mapa de telas e suas tags necessárias
    - Gerenciar subscrições ativas de clientes
    - Controlar quais tags devem ser lidas do PLC
    - Otimizar leituras baseado em mudanças de tela
    """
    
    def __init__(self, screen_config_path: str = None):
        self.screen_config_path = screen_config_path or self._get_default_config_path()
        
        # Estado das subscrições
        self._active_subscriptions = {}  # {client_id: {tags: [], screen: str, last_heartbeat: float}}
        self._screen_tags = {}           # {screen_name: [tag_names]}
        self._subscribed_tags = set()    # Todas as tags atualmente subscritas
        self._lock = threading.Lock()
        
        # Configurações
        self._heartbeat_timeout = 30.0   # Timeout para remover cliente inativo
        self._cleanup_interval = 60.0    # Intervalo para limpeza de clientes inativos
        
        # Callbacks
        self._on_subscription_change: Optional[Callable] = None
        self._on_screen_change: Optional[Callable] = None
        
        # Thread de limpeza
        self._cleanup_thread = None
        self._stop_cleanup = threading.Event()
        
        # Carrega configuração de telas
        self._load_screen_config()
        
        # Inicia thread de limpeza
        self._start_cleanup_thread()
    
    def _get_default_config_path(self) -> str:
        """Retorna caminho padrão para configuração de telas"""
        return os.path.join(
            os.path.dirname(__file__), '..', '..', 'config', 'screen_tags.json'
        )
    
    def _load_screen_config(self):
        """Carrega configuração de tags por tela"""
        try:
            if os.path.exists(self.screen_config_path):
                with open(self.screen_config_path, 'r', encoding='utf-8') as f:
                    self._screen_tags = json.load(f)
                print(f"[TAG] 📋 Configuração de telas carregada: {len(self._screen_tags)} telas")
            else:
                print(f"[TAG] ⚠️ Arquivo de configuração não encontrado: {self.screen_config_path}")
                self._screen_tags = {}
        except Exception as e:
            print(f"[TAG] ❌ Erro ao carregar configuração de telas: {e}")
            self._screen_tags = {}
    
    def _start_cleanup_thread(self):
        """Inicia thread de limpeza de clientes inativos"""
        self._stop_cleanup.clear()
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="TagSubscriptionCleanup"
        )
        self._cleanup_thread.start()
        print("[TAG] 🧹 Thread de limpeza iniciada")
    
    def _cleanup_loop(self):
        """Loop de limpeza de clientes inativos"""
        while not self._stop_cleanup.is_set():
            try:
                self._cleanup_inactive_clients()
                time.sleep(self._cleanup_interval)
            except Exception as e:
                print(f"[TAG] ❌ Erro na limpeza: {e}")
                time.sleep(10.0)
    
    def _cleanup_inactive_clients(self):
        """Remove clientes inativos (sem heartbeat)"""
        current_time = time.time()
        expired_clients = []
        
        with self._lock:
            for client_id, sub_info in self._active_subscriptions.items():
                if current_time - sub_info['last_heartbeat'] > self._heartbeat_timeout:
                    expired_clients.append(client_id)
        
        if expired_clients:
            for client_id in expired_clients:
                self.unsubscribe_client(client_id)
            print(f"[TAG] 🗑️ Removidos {len(expired_clients)} clientes inativos")
    
    def set_callbacks(self, on_subscription_change=None, on_screen_change=None):
        """Define callbacks para notificações"""
        self._on_subscription_change = on_subscription_change
        self._on_screen_change = on_screen_change
    
    def subscribe_to_screen(self, client_id: str, screen_name: str) -> bool:
        """Subscreve cliente a uma tela específica"""
        try:
            # Obtém tags da tela
            screen_tags = self._screen_tags.get(screen_name, [])
            
            if not screen_tags:
                print(f"[TAG] ⚠️ Tela '{screen_name}' não encontrada ou sem tags")
                return False
            
            with self._lock:
                # Remove subscrição anterior se existir
                if client_id in self._active_subscriptions:
                    old_screen = self._active_subscriptions[client_id]['screen']
                    if old_screen != screen_name:
                        print(f"[TAG] 🔄 Cliente {client_id} trocando de '{old_screen}' para '{screen_name}'")
                
                # Registra nova subscrição
                self._active_subscriptions[client_id] = {
                    'tags': screen_tags.copy(),
                    'screen': screen_name,
                    'last_heartbeat': time.time()
                }
                
                # Atualiza conjunto de tags subscritas
                self._update_subscribed_tags()
            
            # Notifica mudança de tela
            self._notify_screen_change(client_id, screen_name, screen_tags)
            
            print(f"[TAG] ✅ Cliente {client_id} subscrito à tela '{screen_name}' ({len(screen_tags)} tags)")
            return True
            
        except Exception as e:
            print(f"[TAG] ❌ Erro ao subscrever cliente {client_id} à tela {screen_name}: {e}")
            return False
    
    def subscribe_to_tags(self, client_id: str, tag_names: List[str]) -> bool:
        """Subscreve cliente a tags específicas (modo manual)"""
        try:
            if not tag_names:
                return False
            
            with self._lock:
                # Registra subscrição manual
                self._active_subscriptions[client_id] = {
                    'tags': tag_names.copy(),
                    'screen': 'manual',
                    'last_heartbeat': time.time()
                }
                
                # Atualiza conjunto de tags subscritas
                self._update_subscribed_tags()
            
            print(f"[TAG] ✅ Cliente {client_id} subscrito a {len(tag_names)} tags (modo manual)")
            return True
            
        except Exception as e:
            print(f"[TAG] ❌ Erro ao subscrever cliente {client_id} às tags: {e}")
            return False
    
    def unsubscribe_client(self, client_id: str) -> bool:
        """Remove subscrição de um cliente"""
        try:
            with self._lock:
                if client_id in self._active_subscriptions:
                    old_screen = self._active_subscriptions[client_id]['screen']
                    del self._active_subscriptions[client_id]
                    
                    # Atualiza conjunto de tags subscritas
                    self._update_subscribed_tags()
                    
                    print(f"[TAG] 🗑️ Cliente {client_id} removido (tela: {old_screen})")
                    return True
                else:
                    print(f"[TAG] ⚠️ Cliente {client_id} não encontrado")
                    return False
                    
        except Exception as e:
            print(f"[TAG] ❌ Erro ao remover cliente {client_id}: {e}")
            return False
    
    def heartbeat_client(self, client_id: str) -> bool:
        """Atualiza heartbeat de um cliente"""
        try:
            with self._lock:
                if client_id in self._active_subscriptions:
                    self._active_subscriptions[client_id]['last_heartbeat'] = time.time()
                    return True
                else:
                    return False
                    
        except Exception as e:
            print(f"[TAG] ❌ Erro no heartbeat do cliente {client_id}: {e}")
            return False
    
    def _update_subscribed_tags(self):
        """Atualiza conjunto de tags subscritas baseado nas subscrições ativas"""
        new_subscribed_tags = set()
        
        for sub_info in self._active_subscriptions.values():
            new_subscribed_tags.update(sub_info['tags'])
        
        # Verifica se houve mudança
        if new_subscribed_tags != self._subscribed_tags:
            old_count = len(self._subscribed_tags)
            self._subscribed_tags = new_subscribed_tags
            new_count = len(self._subscribed_tags)
            
            print(f"[TAG] 📊 Tags subscritas: {old_count} → {new_count}")
            
            # Notifica mudança de subscrição
            self._notify_subscription_change()
    
    def get_subscribed_tags(self) -> List[str]:
        """Retorna lista de tags atualmente subscritas"""
        with self._lock:
            return list(self._subscribed_tags)
    
    def get_client_subscriptions(self, client_id: str) -> Optional[Dict]:
        """Retorna subscrições de um cliente específico"""
        with self._lock:
            return self._active_subscriptions.get(client_id)
    
    def get_all_subscriptions(self) -> Dict:
        """Retorna todas as subscrições ativas"""
        with self._lock:
            return {
                'clients': len(self._active_subscriptions),
                'total_tags': len(self._subscribed_tags),
                'subscriptions': self._active_subscriptions.copy()
            }
    
    def get_screen_tags(self, screen_name: str) -> List[str]:
        """Retorna tags de uma tela específica"""
        return self._screen_tags.get(screen_name, [])
    
    def add_screen_config(self, screen_name: str, tags: List[str]):
        """Adiciona configuração de uma tela"""
        self._screen_tags[screen_name] = tags.copy()
        self._save_screen_config()
        print(f"[TAG] ➕ Tela '{screen_name}' adicionada com {len(tags)} tags")
    
    def remove_screen_config(self, screen_name: str):
        """Remove configuração de uma tela"""
        if screen_name in self._screen_tags:
            del self._screen_tags[screen_name]
            self._save_screen_config()
            print(f"[TAG] ➖ Tela '{screen_name}' removida")
    
    def _save_screen_config(self):
        """Salva configuração de telas no arquivo"""
        try:
            os.makedirs(os.path.dirname(self.screen_config_path), exist_ok=True)
            with open(self.screen_config_path, 'w', encoding='utf-8') as f:
                json.dump(self._screen_tags, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[TAG] ❌ Erro ao salvar configuração de telas: {e}")
    
    def _notify_subscription_change(self):
        """Notifica mudança nas subscrições"""
        try:
            if self._on_subscription_change:
                self._on_subscription_change(self.get_subscribed_tags())
        except Exception as e:
            print(f"[TAG] ❌ Erro ao notificar mudança de subscrição: {e}")
    
    def _notify_screen_change(self, client_id: str, screen_name: str, tags: List[str]):
        """Notifica mudança de tela"""
        try:
            if self._on_screen_change:
                self._on_screen_change(client_id, screen_name, tags)
        except Exception as e:
            print(f"[TAG] ❌ Erro ao notificar mudança de tela: {e}")
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas das subscrições"""
        with self._lock:
            screen_counts = defaultdict(int)
            for sub_info in self._active_subscriptions.values():
                screen_counts[sub_info['screen']] += 1
            
            return {
                'total_clients': len(self._active_subscriptions),
                'total_subscribed_tags': len(self._subscribed_tags),
                'clients_per_screen': dict(screen_counts),
                'available_screens': list(self._screen_tags.keys())
            }
    
    def cleanup(self):
        """Limpeza completa - para threads e remove todas as subscrições"""
        # Para thread de limpeza
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            self._stop_cleanup.set()
            self._cleanup_thread.join(timeout=2)
        
        # Remove todas as subscrições
        with self._lock:
            self._active_subscriptions.clear()
            self._subscribed_tags.clear()
        
        print("[TAG] 🧹 Cleanup completo realizado")

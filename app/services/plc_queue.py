# app/services/plc_queue.py
import threading
import time
import queue
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
from dataclasses import dataclass
from collections import defaultdict

class OperationType(Enum):
    READ = "read"
    WRITE = "write"
    BATCH_READ = "batch_read"
    BATCH_WRITE = "batch_write"

class Priority(Enum):
    CRITICAL = 1    # Alarmes e emergências
    HIGH = 2        # Estados importantes
    NORMAL = 3      # Leituras regulares
    LOW = 4         # Dados não críticos

@dataclass
class PLCRequest:
    """Representa uma requisição para o PLC"""
    id: str
    operation: OperationType
    priority: Priority
    data: Any  # Tags para ler ou {tag: value} para escrever
    callback: Optional[Callable] = None
    timeout: float = 5.0
    created_at: float = None
    retry_count: int = 0
    max_retries: int = 3
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()

class PLCQueue:
    """
    Sistema de Fila para Operações de PLC
    
    Responsável por:
    - Enfileirar requisições de leitura/escrita
    - Priorizar requisições críticas
    - Processar requisições em lotes quando possível
    - Gerenciar timeouts e retry
    - Otimizar comunicação com PLCs
    """
    
    def __init__(self, max_queue_size: int = 1000):
        self.max_queue_size = max_queue_size
        
        # Filas por prioridade
        self._queues = {
            Priority.CRITICAL: queue.PriorityQueue(maxsize=max_queue_size),
            Priority.HIGH: queue.PriorityQueue(maxsize=max_queue_size),
            Priority.NORMAL: queue.PriorityQueue(maxsize=max_queue_size),
            Priority.LOW: queue.PriorityQueue(maxsize=max_queue_size)
        }
        
        # Estado da fila
        self._lock = threading.Lock()
        self._processing = False
        self._stop_event = threading.Event()
        self._worker_thread = None
        
        # Estatísticas
        self._stats = {
            'total_requests': 0,
            'processed_requests': 0,
            'failed_requests': 0,
            'timeout_requests': 0,
            'retry_requests': 0,
            'batch_operations': 0
        }
        
        # Callbacks
        self._on_request_processed: Optional[Callable] = None
        self._on_request_failed: Optional[Callable] = None
        self._on_batch_ready: Optional[Callable] = None
        
        # Configurações de batching
        self._batch_size = 20
        self._batch_timeout = 0.1  # 100ms para agrupar requisições
        self._last_batch_time = 0
        
        # Contador de requisições para IDs únicos
        self._request_counter = 0
        
    def set_callbacks(self, on_request_processed=None, on_request_failed=None, on_batch_ready=None):
        """Define callbacks para notificações"""
        self._on_request_processed = on_request_processed
        self._on_request_failed = on_request_failed
        self._on_batch_ready = on_batch_ready
    
    def start_processing(self):
        """Inicia processamento da fila"""
        if self._processing:
            return
        
        self._processing = True
        self._stop_event.clear()
        self._worker_thread = threading.Thread(
            target=self._process_loop,
            daemon=True,
            name="PLCQueueWorker"
        )
        self._worker_thread.start()
        print("[QUEUE] 🚀 Processamento da fila iniciado")
    
    def stop_processing(self):
        """Para processamento da fila"""
        if not self._processing:
            return
        
        self._processing = False
        self._stop_event.set()
        
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=2)
        
        print("[QUEUE] 🛑 Processamento da fila parado")
    
    def add_read_request(self, tags: List[str], priority: Priority = Priority.NORMAL, 
                        callback: Optional[Callable] = None, timeout: float = 5.0) -> str:
        """Adiciona requisição de leitura à fila"""
        request_id = self._generate_request_id()
        
        request = PLCRequest(
            id=request_id,
            operation=OperationType.READ,
            priority=priority,
            data=tags,
            callback=callback,
            timeout=timeout
        )
        
        return self._enqueue_request(request)
    
    def add_write_request(self, tag_values: Dict[str, Any], priority: Priority = Priority.HIGH,
                         callback: Optional[Callable] = None, timeout: float = 5.0) -> str:
        """Adiciona requisição de escrita à fila"""
        request_id = self._generate_request_id()
        
        request = PLCRequest(
            id=request_id,
            operation=OperationType.WRITE,
            priority=priority,
            data=tag_values,
            callback=callback,
            timeout=timeout
        )
        
        return self._enqueue_request(request)
    
    def add_batch_read_request(self, tags: List[str], priority: Priority = Priority.NORMAL,
                              callback: Optional[Callable] = None, timeout: float = 10.0) -> str:
        """Adiciona requisição de leitura em lote à fila"""
        request_id = self._generate_request_id()
        
        request = PLCRequest(
            id=request_id,
            operation=OperationType.BATCH_READ,
            priority=priority,
            data=tags,
            callback=callback,
            timeout=timeout
        )
        
        return self._enqueue_request(request)
    
    def add_batch_write_request(self, tag_values: Dict[str, Any], priority: Priority = Priority.HIGH,
                               callback: Optional[Callable] = None, timeout: float = 10.0) -> str:
        """Adiciona requisição de escrita em lote à fila"""
        request_id = self._generate_request_id()
        
        request = PLCRequest(
            id=request_id,
            operation=OperationType.BATCH_WRITE,
            priority=priority,
            data=tag_values,
            callback=callback,
            timeout=timeout
        )
        
        return self._enqueue_request(request)
    
    def _generate_request_id(self) -> str:
        """Gera ID único para requisição"""
        with self._lock:
            self._request_counter += 1
            return f"req_{int(time.time() * 1000)}_{self._request_counter}"
    
    def _enqueue_request(self, request: PLCRequest) -> str:
        """Adiciona requisição à fila apropriada"""
        try:
            # Calcula prioridade numérica (menor = mais prioritário)
            priority_value = request.priority.value
            
            # Adiciona timestamp para ordenação dentro da mesma prioridade
            queue_item = (priority_value, request.created_at, request)
            
            self._queues[request.priority].put_nowait(queue_item)
            
            with self._lock:
                self._stats['total_requests'] += 1
            
            print(f"[QUEUE] ➕ Requisição {request.id} adicionada (prioridade: {request.priority.name})")
            return request.id
            
        except queue.Full:
            print(f"[QUEUE] ❌ Fila cheia - requisição {request.id} rejeitada")
            return None
        except Exception as e:
            print(f"[QUEUE] ❌ Erro ao adicionar requisição {request.id}: {e}")
            return None
    
    def _process_loop(self):
        """Loop principal de processamento da fila"""
        print("[QUEUE] 🔄 Iniciando loop de processamento")
        
        while not self._stop_event.is_set():
            try:
                # Tenta processar requisições em lotes primeiro
                if self._try_process_batch():
                    continue
                
                # Processa requisições individuais por prioridade
                if self._try_process_single():
                    continue
                
                # Se não há requisições, aguarda um pouco
                time.sleep(0.01)
                
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no loop de processamento: {e}")
                time.sleep(0.1)
        
        print("[QUEUE] 🛑 Loop de processamento finalizado")
    
    def _try_process_batch(self) -> bool:
        """Tenta processar requisições em lote"""
        current_time = time.time()
        
        # Verifica se é hora de processar lote
        if current_time - self._last_batch_time < self._batch_timeout:
            return False
        
        # Coleta requisições para lote
        batch_requests = self._collect_batch_requests()
        
        if not batch_requests:
            return False
        
        # Processa lote
        self._process_batch(batch_requests)
        self._last_batch_time = current_time
        
        with self._lock:
            self._stats['batch_operations'] += 1
        
        return True
    
    def _collect_batch_requests(self) -> List[PLCRequest]:
        """Coleta requisições para processamento em lote"""
        batch_requests = []
        
        # Coleta requisições de leitura em lote (prioridade alta)
        for priority in [Priority.CRITICAL, Priority.HIGH, Priority.NORMAL]:
            queue_obj = self._queues[priority]
            
            # Coleta até batch_size requisições de leitura
            read_requests = []
            write_requests = []
            
            while len(batch_requests) < self._batch_size:
                try:
                    # Tenta pegar requisição sem bloquear
                    _, _, request = queue_obj.get_nowait()
                    
                    if request.operation == OperationType.BATCH_READ:
                        read_requests.append(request)
                    elif request.operation == OperationType.BATCH_WRITE:
                        write_requests.append(request)
                    else:
                        # Requisição individual - volta para a fila
                        queue_obj.put((priority.value, request.created_at, request))
                        break
                        
                except queue.Empty:
                    break
            
            # Adiciona requisições de leitura ao lote
            batch_requests.extend(read_requests)
            
            # Se há requisições de escrita, processa separadamente
            if write_requests:
                self._process_batch(write_requests)
        
        return batch_requests
    
    def _process_batch(self, requests: List[PLCRequest]):
        """Processa lote de requisições"""
        if not requests:
            return
        
        # Agrupa por tipo de operação
        read_requests = [r for r in requests if r.operation == OperationType.BATCH_READ]
        write_requests = [r for r in requests if r.operation == OperationType.BATCH_WRITE]
        
        # Processa leituras em lote
        if read_requests:
            self._process_batch_read(read_requests)
        
        # Processa escritas em lote
        if write_requests:
            self._process_batch_write(write_requests)
    
    def _process_batch_read(self, requests: List[PLCRequest]):
        """Processa lote de leituras"""
        # Coleta todas as tags únicas
        all_tags = set()
        for request in requests:
            all_tags.update(request.data)
        
        all_tags = list(all_tags)
        
        print(f"[QUEUE] 📖 Processando lote de leitura: {len(requests)} requisições, {len(all_tags)} tags")
        
        # Notifica callback para processar lote
        if self._on_batch_ready:
            try:
                result = self._on_batch_ready('batch_read', all_tags)
                self._notify_requests_completed(requests, result)
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no processamento de lote de leitura: {e}")
                self._notify_requests_failed(requests, str(e))
        else:
            print("[QUEUE] ⚠️ Nenhum callback definido para processamento de lote")
            self._notify_requests_failed(requests, "Nenhum callback definido")
    
    def _process_batch_write(self, requests: List[PLCRequest]):
        """Processa lote de escritas"""
        # Coleta todos os valores de tags
        all_values = {}
        for request in requests:
            all_values.update(request.data)
        
        print(f"[QUEUE] 📝 Processando lote de escrita: {len(requests)} requisições, {len(all_values)} tags")
        
        # Notifica callback para processar lote
        if self._on_batch_ready:
            try:
                result = self._on_batch_ready('batch_write', all_values)
                self._notify_requests_completed(requests, result)
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no processamento de lote de escrita: {e}")
                self._notify_requests_failed(requests, str(e))
        else:
            print("[QUEUE] ⚠️ Nenhum callback definido para processamento de lote")
            self._notify_requests_failed(requests, "Nenhum callback definido")
    
    def _try_process_single(self) -> bool:
        """Tenta processar uma requisição individual"""
        # Processa por prioridade (CRITICAL primeiro)
        for priority in [Priority.CRITICAL, Priority.HIGH, Priority.NORMAL, Priority.LOW]:
            queue_obj = self._queues[priority]
            
            try:
                # Tenta pegar requisição sem bloquear
                _, _, request = queue_obj.get_nowait()
                
                # Verifica timeout
                if time.time() - request.created_at > request.timeout:
                    print(f"[QUEUE] ⏰ Requisição {request.id} expirada")
                    self._notify_request_timeout(request)
                    continue
                
                # Processa requisição individual
                self._process_single_request(request)
                return True
                
            except queue.Empty:
                continue
        
        return False
    
    def _process_single_request(self, request: PLCRequest):
        """Processa uma requisição individual"""
        print(f"[QUEUE] 🔄 Processando requisição {request.id} ({request.operation.value})")
        
        try:
            if request.operation == OperationType.READ:
                self._process_read_request(request)
            elif request.operation == OperationType.WRITE:
                self._process_write_request(request)
            else:
                print(f"[QUEUE] ❌ Operação não suportada: {request.operation}")
                self._notify_request_failed(request, "Operação não suportada")
                
        except Exception as e:
            print(f"[QUEUE] ❌ Erro ao processar requisição {request.id}: {e}")
            self._notify_request_failed(request, str(e))
    
    def _process_read_request(self, request: PLCRequest):
        """Processa requisição de leitura individual"""
        if self._on_batch_ready:
            try:
                result = self._on_batch_ready('read', request.data)
                self._notify_request_completed(request, result)
            except Exception as e:
                self._notify_request_failed(request, str(e))
        else:
            self._notify_request_failed(request, "Nenhum callback definido")
    
    def _process_write_request(self, request: PLCRequest):
        """Processa requisição de escrita individual"""
        if self._on_batch_ready:
            try:
                result = self._on_batch_ready('write', request.data)
                self._notify_request_completed(request, result)
            except Exception as e:
                self._notify_request_failed(request, str(e))
        else:
            self._notify_request_failed(request, "Nenhum callback definido")
    
    def _notify_requests_completed(self, requests: List[PLCRequest], result: Any):
        """Notifica que requisições foram completadas"""
        for request in requests:
            self._notify_request_completed(request, result)
    
    def _notify_requests_failed(self, requests: List[PLCRequest], error: str):
        """Notifica que requisições falharam"""
        for request in requests:
            self._notify_request_failed(request, error)
    
    def _notify_request_completed(self, request: PLCRequest, result: Any):
        """Notifica que uma requisição foi completada"""
        with self._lock:
            self._stats['processed_requests'] += 1
        
        print(f"[QUEUE] ✅ Requisição {request.id} completada")
        
        if request.callback:
            try:
                request.callback(True, result, None)
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no callback da requisição {request.id}: {e}")
        
        if self._on_request_processed:
            try:
                self._on_request_processed(request, result)
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no callback de processamento: {e}")
    
    def _notify_request_failed(self, request: PLCRequest, error: str):
        """Notifica que uma requisição falhou"""
        with self._lock:
            self._stats['failed_requests'] += 1
        
        print(f"[QUEUE] ❌ Requisição {request.id} falhou: {error}")
        
        if request.callback:
            try:
                request.callback(False, None, error)
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no callback de falha da requisição {request.id}: {e}")
        
        if self._on_request_failed:
            try:
                self._on_request_failed(request, error)
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no callback de falha: {e}")
    
    def _notify_request_timeout(self, request: PLCRequest):
        """Notifica que uma requisição expirou"""
        with self._lock:
            self._stats['timeout_requests'] += 1
        
        print(f"[QUEUE] ⏰ Requisição {request.id} expirada")
        
        if request.callback:
            try:
                request.callback(False, None, "Timeout")
            except Exception as e:
                print(f"[QUEUE] ❌ Erro no callback de timeout da requisição {request.id}: {e}")
    
    def get_queue_size(self) -> Dict[str, int]:
        """Retorna tamanho das filas por prioridade"""
        sizes = {}
        for priority, queue_obj in self._queues.items():
            sizes[priority.name] = queue_obj.qsize()
        return sizes
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas da fila"""
        with self._lock:
            stats = self._stats.copy()
        
        stats['queue_sizes'] = self.get_queue_size()
        stats['processing'] = self._processing
        return stats
    
    def clear_queue(self, priority: Optional[Priority] = None):
        """Limpa fila(s) de requisições"""
        if priority:
            # Limpa fila específica
            while not self._queues[priority].empty():
                try:
                    self._queues[priority].get_nowait()
                except queue.Empty:
                    break
            print(f"[QUEUE] 🗑️ Fila {priority.name} limpa")
        else:
            # Limpa todas as filas
            for queue_obj in self._queues.values():
                while not queue_obj.empty():
                    try:
                        queue_obj.get_nowait()
                    except queue.Empty:
                        break
            print("[QUEUE] 🗑️ Todas as filas limpas")
    
    def cleanup(self):
        """Limpeza completa - para processamento e limpa filas"""
        self.stop_processing()
        self.clear_queue()
        print("[QUEUE] 🧹 Cleanup completo realizado")

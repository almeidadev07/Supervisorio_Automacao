# app/services/write_verifier.py
# Sistema de Verificação de Escrita para PLC
# Garante que valores foram realmente escritos no PLC

import time
import threading
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from collections import defaultdict
import queue

@dataclass
class WriteVerification:
    request_id: str
    tag_values: Dict[str, Any]
    created_at: float
    max_retries: int = 3
    retry_count: int = 0
    verification_interval: float = 0.5  # 500ms entre verificações
    timeout: float = 5.0  # 5s timeout total
    callback: Optional[Callable] = None

class WriteVerifier:
    """
    Sistema de Verificação de Escrita para PLC
    
    Características:
    - Verifica se valores foram realmente escritos no PLC
    - Retry automático em caso de falha
    - Callbacks para notificação de sucesso/falha
    - Timeout configurável por operação
    - Suporte a tolerância para valores numéricos
    """
    
    def __init__(self, read_function: Callable[[List[str]], Dict[str, Any]]):
        self.read_function = read_function
        self._pending_verifications = {}  # {request_id: WriteVerification}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        
        # Thread de verificação
        self._verification_thread = threading.Thread(
            target=self._verification_loop,
            daemon=True,
            name="WriteVerifier"
        )
        self._verification_thread.start()
        
        # Estatísticas
        self._stats = {
            'total_verifications': 0,
            'successful_verifications': 0,
            'failed_verifications': 0,
            'timeout_verifications': 0,
            'retry_verifications': 0
        }
        
        print("[WRITE_VERIFIER] 🔍 Sistema de verificação de escrita iniciado")
    
    def schedule_verification(self, request_id: str, tag_values: Dict[str, Any], 
                            callback: Optional[Callable] = None) -> bool:
        """Agenda verificação de escrita"""
        if not tag_values:
            return True
        
        verification = WriteVerification(
            request_id=request_id,
            tag_values=tag_values,
            created_at=time.time(),
            callback=callback
        )
        
        with self._lock:
            self._pending_verifications[request_id] = verification
        
        print(f"[WRITE_VERIFIER] 📝 Verificação agendada para {request_id}: {list(tag_values.keys())}")
        return True
    
    def _verification_loop(self):
        """Loop principal de verificação"""
        while not self._stop_event.is_set():
            try:
                current_time = time.time()
                
                # Processa verificações pendentes
                self._process_pending_verifications(current_time)
                
                # Aguarda intervalo
                time.sleep(0.1)  # 100ms
                
            except Exception as e:
                print(f"[WRITE_VERIFIER] ❌ Erro no loop de verificação: {e}")
                time.sleep(0.5)
    
    def _process_pending_verifications(self, current_time: float):
        """Processa verificações pendentes"""
        with self._lock:
            expired_verifications = []
            
            for request_id, verification in self._pending_verifications.items():
                # Verifica timeout
                if current_time - verification.created_at > verification.timeout:
                    expired_verifications.append(request_id)
                    self._handle_verification_timeout(verification)
                    continue
                
                # Verifica se é hora de verificar
                if current_time - verification.created_at < verification.verification_interval:
                    continue
                
                # Executa verificação
                self._verify_write(verification)
    
    def _verify_write(self, verification: WriteVerification):
        """Verifica se uma escrita foi bem-sucedida"""
        try:
            # Lê valores atuais do PLC
            current_values = self.read_function(list(verification.tag_values.keys()))
            
            if not current_values:
                # Falha na leitura, agenda retry
                self._schedule_retry(verification)
                return
            
            # Compara valores
            success = self._compare_values(verification.tag_values, current_values)
            
            if success:
                # Verificação bem-sucedida
                self._handle_verification_success(verification)
            else:
                # Verificação falhou, agenda retry
                self._schedule_retry(verification)
                
        except Exception as e:
            print(f"[WRITE_VERIFIER] ❌ Erro na verificação {verification.request_id}: {e}")
            self._schedule_retry(verification)
    
    def _compare_values(self, expected: Dict[str, Any], actual: Dict[str, Any]) -> bool:
        """Compara valores esperados com valores atuais"""
        for tag, expected_value in expected.items():
            if tag not in actual:
                return False
            
            actual_value = actual[tag]
            
            # Comparação especial para valores numéricos
            if isinstance(expected_value, (int, float)) and isinstance(actual_value, (int, float)):
                # Tolerância de 0.01 para valores numéricos
                if abs(expected_value - actual_value) > 0.01:
                    return False
            else:
                # Comparação exata para outros tipos
                if expected_value != actual_value:
                    return False
        
        return True
    
    def _schedule_retry(self, verification: WriteVerification):
        """Agenda retry de verificação"""
        verification.retry_count += 1
        
        if verification.retry_count >= verification.max_retries:
            # Máximo de retries atingido
            self._handle_verification_failure(verification)
        else:
            # Agenda próximo retry
            verification.created_at = time.time()  # Reset timer
            with self._lock:
                self._stats['retry_verifications'] += 1
            
            print(f"[WRITE_VERIFIER] 🔄 Retry {verification.retry_count}/{verification.max_retries} para {verification.request_id}")
    
    def _handle_verification_success(self, verification: WriteVerification):
        """Trata verificação bem-sucedida"""
        with self._lock:
            # Remove da lista de pendentes
            if verification.request_id in self._pending_verifications:
                del self._pending_verifications[verification.request_id]
            
            # Atualiza estatísticas
            self._stats['total_verifications'] += 1
            self._stats['successful_verifications'] += 1
        
        print(f"[WRITE_VERIFIER] ✅ Verificação bem-sucedida para {verification.request_id}")
        
        # Chama callback se definido
        if verification.callback:
            try:
                verification.callback(verification.request_id, True, verification.tag_values)
            except Exception as e:
                print(f"[WRITE_VERIFIER] ❌ Erro no callback de sucesso: {e}")
    
    def _handle_verification_failure(self, verification: WriteVerification):
        """Trata falha na verificação"""
        with self._lock:
            # Remove da lista de pendentes
            if verification.request_id in self._pending_verifications:
                del self._pending_verifications[verification.request_id]
            
            # Atualiza estatísticas
            self._stats['total_verifications'] += 1
            self._stats['failed_verifications'] += 1
        
        print(f"[WRITE_VERIFIER] ❌ Verificação falhou para {verification.request_id}")
        
        # Chama callback se definido
        if verification.callback:
            try:
                verification.callback(verification.request_id, False, verification.tag_values)
            except Exception as e:
                print(f"[WRITE_VERIFIER] ❌ Erro no callback de falha: {e}")
    
    def _handle_verification_timeout(self, verification: WriteVerification):
        """Trata timeout na verificação"""
        with self._lock:
            # Remove da lista de pendentes
            if verification.request_id in self._pending_verifications:
                del self._pending_verifications[verification.request_id]
            
            # Atualiza estatísticas
            self._stats['total_verifications'] += 1
            self._stats['timeout_verifications'] += 1
        
        print(f"[WRITE_VERIFIER] ⏰ Timeout na verificação para {verification.request_id}")
        
        # Chama callback se definido
        if verification.callback:
            try:
                verification.callback(verification.request_id, False, verification.tag_values)
            except Exception as e:
                print(f"[WRITE_VERIFIER] ❌ Erro no callback de timeout: {e}")
    
    def get_pending_verifications(self) -> List[str]:
        """Retorna lista de verificações pendentes"""
        with self._lock:
            return list(self._pending_verifications.keys())
    
    def cancel_verification(self, request_id: str) -> bool:
        """Cancela uma verificação pendente"""
        with self._lock:
            if request_id in self._pending_verifications:
                del self._pending_verifications[request_id]
                print(f"[WRITE_VERIFIER] 🗑️ Verificação cancelada para {request_id}")
                return True
            return False
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do verificador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'pending_verifications': len(self._pending_verifications)
        })
        
        return stats
    
    def reset_statistics(self):
        """Reseta estatísticas"""
        with self._lock:
            self._stats = {
                'total_verifications': 0,
                'successful_verifications': 0,
                'failed_verifications': 0,
                'timeout_verifications': 0,
                'retry_verifications': 0
            }
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_event.set()
        
        if self._verification_thread.is_alive():
            self._verification_thread.join(timeout=2)
        
        with self._lock:
            self._pending_verifications.clear()
        
        print("[WRITE_VERIFIER] 🧹 Cleanup completo realizado")

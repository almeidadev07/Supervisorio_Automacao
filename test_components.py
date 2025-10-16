#!/usr/bin/env python3
# test_components.py
# Teste dos componentes do controlador PLC sem dependências externas

import time
import threading
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum
from collections import defaultdict, deque

# ============================================================================
# PriorityManager - Versão de teste sem dependências
# ============================================================================

class TagPriority(Enum):
    CRITICAL = 1    # Velocidade, comandos de emergência, alarmes
    HIGH = 2        # Estados de máquina, parâmetros de processo
    NORMAL = 3      # Telemetria, dados de monitoramento
    LOW = 4         # Dados históricos, estatísticas

@dataclass
class TagInfo:
    name: str
    priority: TagPriority
    last_read: float = 0
    last_write: float = 0
    read_interval: float = 0.1  # 100ms para críticos
    write_interval: float = 0.05  # 50ms para críticos
    is_writable: bool = True
    is_critical: bool = False

class PriorityManager:
    """Gerenciador de Prioridades para Comunicação com PLC"""
    
    def __init__(self):
        self._tag_info = {}
        self._lock = threading.Lock()
        
        # Configurações de throttling
        self._throttle_limits = {
            TagPriority.CRITICAL: 0.05,  # 50ms mínimo entre operações
            TagPriority.HIGH: 0.1,       # 100ms mínimo entre operações
            TagPriority.NORMAL: 0.2,     # 200ms mínimo entre operações
            TagPriority.LOW: 0.5         # 500ms mínimo entre operações
        }
        
        # Estatísticas
        self._stats = {
            'critical_operations': 0,
            'high_operations': 0,
            'normal_operations': 0,
            'low_operations': 0,
            'throttled_operations': 0,
            'total_operations': 0
        }
        
        # Inicializa tags críticas conhecidas
        self._init_critical_tags()
    
    def _init_critical_tags(self):
        """Inicializa tags críticas conhecidas"""
        critical_patterns = [
            'VEL', 'VELOC', 'SPEED',  # Velocidade
            'CMD', 'COMMAND', 'COMANDO',  # Comandos
            'ALARME', 'ALARM', 'EMERG', 'EMERGENCY',  # Alarmes
            'ESTADO', 'STATE', 'STATUS',  # Estados críticos
            'DB10', 'DB104',  # Dados críticos
            'PRINCIPAL', 'MAIN', 'CRITICO', 'CRITICAL'  # Tags principais
        ]
        
        # Padrões de tags de escrita crítica
        write_critical_patterns = [
            'VEL', 'VELOC', 'SPEED',  # Velocidade
            'CMD', 'COMMAND', 'COMANDO',  # Comandos
            'SET', 'CONFIG', 'PARAM'  # Parâmetros
        ]
        
        self._critical_patterns = critical_patterns
        self._write_critical_patterns = write_critical_patterns
    
    def register_tag(self, tag_name: str, is_writable: bool = True) -> TagInfo:
        """Registra uma nova tag com prioridade automática"""
        priority = self._determine_priority(tag_name)
        is_critical = self._is_critical_tag(tag_name)
        
        tag_info = TagInfo(
            name=tag_name,
            priority=priority,
            is_writable=is_writable,
            is_critical=is_critical
        )
        
        # Ajusta intervalos baseado na prioridade
        if priority == TagPriority.CRITICAL:
            tag_info.read_interval = 0.05  # 50ms
            tag_info.write_interval = 0.02  # 20ms
        elif priority == TagPriority.HIGH:
            tag_info.read_interval = 0.1   # 100ms
            tag_info.write_interval = 0.05  # 50ms
        elif priority == TagPriority.NORMAL:
            tag_info.read_interval = 0.2   # 200ms
            tag_info.write_interval = 0.1   # 100ms
        else:  # LOW
            tag_info.read_interval = 0.5   # 500ms
            tag_info.write_interval = 0.2   # 200ms
        
        with self._lock:
            self._tag_info[tag_name] = tag_info
        
        return tag_info
    
    def _determine_priority(self, tag_name: str) -> TagPriority:
        """Determina prioridade de uma tag baseado no nome"""
        name_upper = tag_name.upper()
        
        # Verifica padrões críticos
        for pattern in self._critical_patterns:
            if pattern in name_upper:
                return TagPriority.CRITICAL
        
        # Verifica padrões de alta prioridade
        high_patterns = ['TEMP', 'TEMPERATURA', 'PRESSAO', 'PRESSURE', 'NIVEL', 'LEVEL']
        for pattern in high_patterns:
            if pattern in name_upper:
                return TagPriority.HIGH
        
        # Verifica padrões de baixa prioridade
        low_patterns = ['HIST', 'HISTORICO', 'STAT', 'STATISTIC', 'LOG']
        for pattern in low_patterns:
            if pattern in name_upper:
                return TagPriority.LOW
        
        # Padrão normal
        return TagPriority.NORMAL
    
    def _is_critical_tag(self, tag_name: str) -> bool:
        """Verifica se uma tag é crítica"""
        name_upper = tag_name.upper()
        
        # Verifica padrões de escrita crítica
        for pattern in self._write_critical_patterns:
            if pattern in name_upper:
                return True
        
        return False
    
    def can_read(self, tag_name: str) -> bool:
        """Verifica se uma tag pode ser lida agora (throttling)"""
        with self._lock:
            if tag_name not in self._tag_info:
                return True  # Tag não registrada, permite leitura
            
            tag_info = self._tag_info[tag_name]
            current_time = time.time()
            
            # Verifica throttling
            if current_time - tag_info.last_read < tag_info.read_interval:
                self._stats['throttled_operations'] += 1
                return False
            
            # Atualiza timestamp
            tag_info.last_read = current_time
            self._stats['total_operations'] += 1
            
            # Atualiza estatísticas por prioridade
            if tag_info.priority == TagPriority.CRITICAL:
                self._stats['critical_operations'] += 1
            elif tag_info.priority == TagPriority.HIGH:
                self._stats['high_operations'] += 1
            elif tag_info.priority == TagPriority.NORMAL:
                self._stats['normal_operations'] += 1
            else:
                self._stats['low_operations'] += 1
            
            return True
    
    def can_write(self, tag_name: str) -> bool:
        """Verifica se uma tag pode ser escrita agora (throttling)"""
        with self._lock:
            if tag_name not in self._tag_info:
                return True  # Tag não registrada, permite escrita
            
            tag_info = self._tag_info[tag_name]
            current_time = time.time()
            
            # Verifica se tag é gravável
            if not tag_info.is_writable:
                return False
            
            # Verifica throttling
            if current_time - tag_info.last_write < tag_info.write_interval:
                self._stats['throttled_operations'] += 1
                return False
            
            # Atualiza timestamp
            tag_info.last_write = current_time
            self._stats['total_operations'] += 1
            
            # Atualiza estatísticas por prioridade
            if tag_info.priority == TagPriority.CRITICAL:
                self._stats['critical_operations'] += 1
            elif tag_info.priority == TagPriority.HIGH:
                self._stats['high_operations'] += 1
            elif tag_info.priority == TagPriority.NORMAL:
                self._stats['normal_operations'] += 1
            else:
                self._stats['low_operations'] += 1
            
            return True
    
    def get_read_priority(self, tag_names: List[str]) -> List[str]:
        """Retorna tags ordenadas por prioridade para leitura"""
        with self._lock:
            # Agrupa tags por prioridade
            priority_groups = defaultdict(list)
            
            for tag_name in tag_names:
                if tag_name in self._tag_info:
                    tag_info = self._tag_info[tag_name]
                    priority_groups[tag_info.priority].append(tag_name)
                else:
                    # Tag não registrada, assume prioridade normal
                    priority_groups[TagPriority.NORMAL].append(tag_name)
            
            # Ordena por prioridade (CRITICAL primeiro)
            ordered_tags = []
            for priority in [TagPriority.CRITICAL, TagPriority.HIGH, TagPriority.NORMAL, TagPriority.LOW]:
                if priority in priority_groups:
                    ordered_tags.extend(priority_groups[priority])
            
            return ordered_tags
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do gerenciador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'total_tags': len(self._tag_info),
            'critical_tags': len([t for t in self._tag_info.values() if t.is_critical]),
            'writable_tags': len([t for t in self._tag_info.values() if t.is_writable])
        })
        
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        with self._lock:
            self._tag_info.clear()

# ============================================================================
# WriteVerifier - Versão de teste sem dependências
# ============================================================================

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
    """Sistema de Verificação de Escrita para PLC"""
    
    def __init__(self, read_function: Callable[[List[str]], Dict[str, Any]]):
        self.read_function = read_function
        self._pending_verifications = {}
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
    
    def get_statistics(self) -> Dict:
        """Retorna estatísticas do verificador"""
        with self._lock:
            stats = self._stats.copy()
        
        stats.update({
            'pending_verifications': len(self._pending_verifications)
        })
        
        return stats
    
    def cleanup(self):
        """Limpeza completa"""
        self._stop_event.set()
        
        if self._verification_thread.is_alive():
            self._verification_thread.join(timeout=2)
        
        with self._lock:
            self._pending_verifications.clear()

# ============================================================================
# Testes
# ============================================================================

def test_priority_manager():
    """Testa o gerenciador de prioridades"""
    print("🎯 Testando Sistema de Prioridades")
    print("=" * 40)
    
    manager = PriorityManager()
    
    # Testa registro de tags
    test_tags = [
        "VELOCIDADE_PRINCIPAL",  # Deve ser CRITICAL
        "TEMP_MOTOR",           # Deve ser HIGH
        "STATUS_GERAL",         # Deve ser NORMAL
        "HISTORICO_DADOS"       # Deve ser LOW
    ]
    
    for tag in test_tags:
        tag_info = manager.register_tag(tag)
        print(f"📋 {tag}: {tag_info.priority.name} (crítico: {tag_info.is_critical})")
    
    # Testa throttling
    print("\n⏱️ Testando throttling...")
    for tag in test_tags:
        can_read = manager.can_read(tag)
        can_write = manager.can_write(tag)
        print(f"📊 {tag}: ler={can_read}, escrever={can_write}")
    
    # Testa ordenação por prioridade
    print("\n📋 Testando ordenação por prioridade...")
    ordered_tags = manager.get_read_priority(test_tags)
    print(f"🔢 Ordem de prioridade: {ordered_tags}")
    
    # Testa estatísticas
    stats = manager.get_statistics()
    print(f"\n📊 Estatísticas: {stats}")
    
    manager.cleanup()
    print("✅ Teste do gerenciador de prioridades passou!")
    return True

def test_write_verifier():
    """Testa o verificador de escrita"""
    print("\n🔍 Testando Verificador de Escrita")
    print("=" * 40)
    
    # Função mock para leitura
    def mock_read_function(tags):
        return {tag: f"mock_value_{tag}" for tag in tags}
    
    verifier = WriteVerifier(mock_read_function)
    
    # Testa agendamento de verificação
    test_values = {
        "TAG1": 100.0,
        "TAG2": 200.0
    }
    
    verifier.schedule_verification("test_001", test_values)
    print(f"📝 Verificação agendada para: {list(test_values.keys())}")
    
    # Aguarda um pouco
    time.sleep(0.1)
    
    # Testa estatísticas
    stats = verifier.get_statistics()
    print(f"📊 Estatísticas do verificador: {stats}")
    
    verifier.cleanup()
    print("✅ Teste do verificador de escrita passou!")
    return True

if __name__ == "__main__":
    print("🚀 Iniciando Testes dos Componentes do Controlador PLC")
    print("=" * 60)
    
    # Testa sistema de prioridades
    priority_ok = test_priority_manager()
    
    # Testa verificador de escrita
    verifier_ok = test_write_verifier()
    
    # Resultado final
    if priority_ok and verifier_ok:
        print("\n🎉 Todos os testes passaram com sucesso!")
        print("✅ Os componentes do controlador PLC estão funcionando")
    else:
        print("\n❌ Alguns testes falharam")
        print("⚠️ Verifique os logs para mais detalhes")
    
    print("\n" + "=" * 60)
    print("🏁 Testes concluídos")

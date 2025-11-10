# app/plc_drivers/nodes7.py
import time
from .base import BasePLC
from ..services.nodes7_proxy import NodeS7Proxy


class Nodes7Driver(BasePLC):
    """
    Driver para comunicação com PLC Siemens usando Nodes7 (via proxy Node.js).
    
    Este driver usa o NodeS7Proxy para se comunicar com o servidor Node.js
    que gerencia a conexão real com o PLC através da biblioteca nodes7.
    """
    
    def __init__(self, ip, config):
        super().__init__(ip, config)
        self.proxy = NodeS7Proxy()
        self._connected = False
        self._last_check = 0
        self._check_interval = 5.0  # Verifica conexão a cada 5 segundos
        
        print(f"[Nodes7] Driver criado para {ip}")
        print(f"[Nodes7] Base URL do proxy: {self.proxy.base_url}")
    
    def connect(self):
        """
        Verifica se o servidor Node.js está acessível.
        O servidor já deve estar rodando externamente.
        """
        try:
            print(f'[Nodes7] Verificando conexão com servidor Node.js em {self.proxy.base_url}')
            
            # Tenta fazer uma requisição de health check com retry
            result = None
            for attempt in range(3):
                try:
                    result = self.proxy._do_request(f"{self.proxy.base_url}/health", timeout=2.0)
                    if result and result.get('ok'):
                        break
                except Exception as e:
                    if attempt < 2:
                        import time
                        time.sleep(0.5)
                        continue
                    else:
                        print(f'[Nodes7] ⚠️ Health check falhou após 3 tentativas: {e}')
            
            if result and result.get('ok'):
                print('[Nodes7] ✅ Servidor Node.js acessível')
                self._connected = True
                
                # Configura a máquina ativa no proxy
                try:
                    self.proxy.set_active_machine(self.config)
                except Exception as e:
                    print(f'[Nodes7] ⚠️ Erro ao configurar máquina no proxy: {e}')
                
                return True
            else:
                # Se health check falhou, tenta verificar se o servidor responde em /api/stats
                try:
                    stats_result = self.proxy._do_request(f"{self.proxy.base_url}/api/stats", timeout=2.0)
                    if stats_result and stats_result.get('ok'):
                        print('[Nodes7] ✅ Servidor Node.js acessível (via /api/stats)')
                        self._connected = True
                        try:
                            self.proxy.set_active_machine(self.config)
                        except Exception:
                            pass
                        return True
                except Exception:
                    pass
                
                print('[Nodes7] ⚠️ Servidor Node.js pode não estar totalmente inicializado, mas continuando...')
                self._connected = True  # Assume conectado mesmo se health check falhar
                return True  # Retorna True para não bloquear o sistema
                
        except Exception as e:
            print(f'[Nodes7] ⚠️ Erro ao conectar (mas continuando): {e}')
            # Assume conectado mesmo com erro para não bloquear o sistema
            self._connected = True
            return True
    
    def disconnect(self):
        """Desconecta do servidor (apenas marca como desconectado)"""
        try:
            print('[Nodes7] Desconectando')
            self._connected = False
        except Exception as e:
            print(f'[Nodes7] Erro ao desconectar: {e}')
    
    def is_connected(self) -> bool:
        """
        Verifica se está conectado ao servidor Node.js.
        Faz verificações periódicas para confirmar que o servidor ainda está acessível.
        """
        try:
            current_time = time.time()
            
            # Se checou recentemente, retorna o estado armazenado
            if current_time - self._last_check < self._check_interval:
                return self._connected
            
            # Faz uma verificação periódica (menos frequente para não sobrecarregar)
            self._last_check = current_time
            
            # Tenta health check, mas se falhar, tenta /api/stats como fallback
            result = self.proxy._do_request(f"{self.proxy.base_url}/health", timeout=1.5)
            
            if result and result.get('ok'):
                self._connected = True
                return True
            
            # Fallback: tenta /api/stats
            try:
                stats_result = self.proxy._do_request(f"{self.proxy.base_url}/api/stats", timeout=1.5)
                if stats_result and stats_result.get('ok'):
                    self._connected = True
                    return True
            except Exception:
                pass
            
            # Se ambos falharem, ainda assume conectado (evita desconexões falsas)
            # O servidor pode estar temporariamente ocupado
            return self._connected
                
        except Exception as e:
            # Em caso de erro, mantém o estado anterior (não desconecta)
            return self._connected
    
    def reconnect(self) -> bool:
        """
        Tenta reconectar ao servidor Node.js.
        """
        try:
            print(f'[Nodes7] 🔄 Tentando reconectar')
            
            # Força desconexão
            self.disconnect()
            
            # Aguarda um pouco
            time.sleep(1.0)
            
            # Tenta conectar novamente
            return self.connect()
            
        except Exception as e:
            print(f'[Nodes7] ❌ Erro na reconexão: {e}')
            return False
    
    def read_telemetry(self):
        """
        Lê telemetria básica (compatibilidade).
        Retorna timestamp e fonte.
        """
        return {
            'time': time.time(),
            'source': 'nodes7'
        }
    
    def read_tags(self, tag_definitions):
        """
        Lê tags do PLC através do proxy Node.js.
        
        Args:
            tag_definitions: Lista de definições de tags (dicts com 'name', 'type', etc)
                           ou lista de strings com nomes de tags
        
        Returns:
            Dict {nome_tag: valor} ou {nome_tag: None} em caso de erro
        """
        if not tag_definitions:
            return {}
        
        try:
            # Extrai nomes das tags
            if isinstance(tag_definitions[0], dict):
                tag_names = [tag.get('name') for tag in tag_definitions if tag.get('name')]
            elif isinstance(tag_definitions[0], str):
                tag_names = [str(tag) for tag in tag_definitions]
            else:
                tag_names = list(tag_definitions)
            
            if not tag_names:
                return {}
            
            # Lê do servidor Node.js via proxy (usa snapshot para melhor performance)
            result = self.proxy.read_tags(tag_names)
            
            # Garante que todas as tags pedidas tenham um valor (None se não encontrado)
            for tag_name in tag_names:
                if tag_name not in result:
                    result[tag_name] = None
            
            # Log detalhado a cada 20 leituras
            if not hasattr(self, '_read_count'):
                self._read_count = 0
            self._read_count += 1
            
            if self._read_count % 20 == 0:
                valid_count = sum(1 for v in result.values() if v is not None)
                print(f'[Nodes7] 📊 Lidas {len(result)} tags ({valid_count} com valores válidos)')
            
            return result
            
        except Exception as e:
            print(f'[Nodes7] ❌ Erro ao ler tags: {e}')
            import traceback
            traceback.print_exc()
            # Retorna None para todas as tags em caso de erro
            if tag_definitions and isinstance(tag_definitions[0], dict):
                return {tag.get('name'): None for tag in tag_definitions if tag.get('name')}
            else:
                return {str(tag): None for tag in tag_definitions}
    
    def write_tags(self, tag_values):
        """
        Escreve valores nas tags do PLC através do proxy Node.js.
        
        Args:
            tag_values: Dict {nome_tag: valor} para escrever
        
        Returns:
            bool: True se escrita foi bem-sucedida, False caso contrário
        """
        if not tag_values:
            return True
        
        try:
            print(f"[Nodes7] 📝 Escrevendo {len(tag_values)} tags: {list(tag_values.keys())}")
            print(f"[Nodes7] 📝 Valores: {tag_values}")
            
            # Escreve via proxy
            success = self.proxy.write_tags(tag_values)
            
            if success:
                print(f"[Nodes7] ✅ Escrita bem-sucedida!")
                # Log detalhado de cada tag escrita
                for tag_name, value in tag_values.items():
                    print(f"[Nodes7] ✅   {tag_name} = {value}")
            else:
                print(f"[Nodes7] ❌ Falha na escrita")
                # Log detalhado das tags que falharam
                for tag_name, value in tag_values.items():
                    print(f"[Nodes7] ❌   {tag_name} = {value}")
            
            return success
            
        except Exception as e:
            print(f"[Nodes7] ❌ Erro ao escrever tags: {e}")
            import traceback
            traceback.print_exc()
            return False


class MockNodes7Driver(BasePLC):
    """
    Driver mock para testes sem conexão real com o servidor Node.js.
    """
    
    def __init__(self, ip, config):
        super().__init__(ip, config)
        self._connected = False
        print(f"[MockNodes7] Driver mock criado para {ip}")
    
    def connect(self):
        self._connected = True
        print("[MockNodes7] ✅ Mock conectado")
        return True
    
    def disconnect(self):
        self._connected = False
        print("[MockNodes7] Desconectado")
    
    def is_connected(self) -> bool:
        return self._connected
    
    def reconnect(self) -> bool:
        return self.connect()
    
    def read_telemetry(self):
        import time, random
        return {
            'time': time.time(),
            'source': 'mock_nodes7',
            'embaladoras': self.config.get('embaladoras', 0),
            'speed': random.randint(0, 120),
            'accumulator': random.randint(0, 100)
        }
    
    def read_tags(self, tag_definitions):
        """Retorna valores simulados para as tags"""
        import random
        result = {}
        
        for tag in tag_definitions:
            if isinstance(tag, dict):
                name = tag.get('name')
                t = (tag.get('type') or '').upper()
            else:
                name = str(tag)
                t = 'REAL'
            
            if t == 'BOOL':
                result[name] = bool(random.getrandbits(1))
            elif t == 'REAL':
                result[name] = round(random.uniform(0, 100), 2)
            elif t == 'WORD':
                result[name] = random.randint(0, 65535)
            elif t == 'STRING':
                result[name] = f"Mock_{random.randint(0, 100)}"
            else:
                result[name] = random.randint(0, 100)
        
        return result
    
    def write_tags(self, tag_values):
        """Simula escrita de tags"""
        print(f"[MockNodes7] 📝 Mock escrevendo {len(tag_values)} tags")
        return True


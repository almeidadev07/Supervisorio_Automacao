
import snap7
from snap7.util import *
import time

ip = '100.70.0.10'
rack = 0
slot = 1  # tente 0 se 1 não funcionar

def test_connection_with_retry():
    """Testa conexão com retry automático"""
    max_retries = 3
    retry_delay = 1.0
    
    for attempt in range(max_retries):
        client = snap7.client.Client()
        try:
            print(f"Tentativa {attempt + 1}/{max_retries} de conexão com {ip}")
            client.connect(ip, rack, slot)
            
            if client.get_connected():
                print("✅ Conectado com sucesso!")
                
                # Testa leitura de dados
                try:
                    cpu_info = client.get_cpu_info()
                    print(f"CPU Info: {cpu_info}")
                except Exception as e:
                    print(f"Erro ao ler CPU info: {e}")
                
                client.disconnect()
                return True
            else:
                print("❌ Falha na conexão")
                
        except Exception as e:
            print(f"❌ Erro na tentativa {attempt + 1}: {e}")
        
        finally:
            try:
                client.disconnect()
            except:
                pass
        
        # Aguarda antes da próxima tentativa
        if attempt < max_retries - 1:
            print(f"Aguardando {retry_delay}s antes da próxima tentativa...")
            time.sleep(retry_delay)
            retry_delay *= 2  # Backoff exponencial
    
    print("❌ Todas as tentativas de conexão falharam")
    return False

def test_health_check():
    """Testa verificação de saúde da conexão"""
    client = snap7.client.Client()
    try:
        client.connect(ip, rack, slot)
        if client.get_connected():
            print("🔍 Testando verificação de saúde da conexão...")
            try:
                cpu_info = client.get_cpu_info()
                print("✅ Verificação de saúde: OK")
                return True
            except Exception as e:
                print(f"❌ Verificação de saúde falhou: {e}")
                return False
        else:
            print("❌ Não foi possível conectar para teste de saúde")
            return False
    except Exception as e:
        print(f"❌ Erro no teste de saúde: {e}")
        return False
    finally:
        try:
            client.disconnect()
        except:
            pass

if __name__ == "__main__":
    print("=== Teste de Conexão com PLC ===")
    print(f"IP: {ip}")
    print(f"Rack: {rack}, Slot: {slot}")
    print()
    
    # Teste 1: Conexão com retry
    print("1. Testando conexão com retry automático...")
    success = test_connection_with_retry()
    print()
    
    # Teste 2: Verificação de saúde
    if success:
        print("2. Testando verificação de saúde...")
        test_health_check()
        print()
    
    print("=== Fim dos Testes ===")
    print()
    print("💡 Dica: Para testar reconexão automática:")
    print("   1. Execute o servidor: python app.py")
    print("   2. Desligue o PLC")
    print("   3. Observe os logs de tentativas de reconexão")
    print("   4. Ligue o PLC novamente")
    print("   5. A conexão deve ser restabelecida automaticamente!")

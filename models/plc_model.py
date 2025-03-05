import snap7

class PLCModel:
    def __init__(self, ip_address, rack, slot):
        self.client = snap7.client.Client()
        self.ip_address = ip_address
        self.rack = rack
        self.slot = slot
        self.connected = False

    def connect(self):
        try:
            self.client.connect(self.ip_address, self.rack, self.slot)
            self.connected = True
            print("Conectado ao CLP!")
        except Exception as e:
            print(f"Erro ao conectar ao CLP: {e}")

    def disconnect(self):
        if self.connected:
            self.client.disconnect()
            self.connected = False
            print("Desconectado do CLP.")

    def read_data(self, db_number, start_offset, size):
        if self.connected:
            try:
                data = self.client.db_read(db_number, start_offset, size)
                return data
            except Exception as e:
                print(f"Erro ao ler dados do CLP: {e}")
        return None

    def write_data(self, db_number, start_offset, data):
        if self.connected:
            try:
                self.client.db_write(db_number, start_offset, data)
                print("Dados escritos no CLP.")
            except Exception as e:
                print(f"Erro ao escrever dados no CLP: {e}")

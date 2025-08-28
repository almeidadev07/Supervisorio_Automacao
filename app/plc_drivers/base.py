# app/plc_drivers/base.py
from abc import ABC, abstractmethod

class BasePLC(ABC):
    def __init__(self, ip, config):
        self.ip = ip
        self.config = config

    @abstractmethod
    def connect(self):
        pass

    @abstractmethod
    def disconnect(self):
        pass

    @abstractmethod
    def read_telemetry(self):
        pass

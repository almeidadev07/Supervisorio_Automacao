"""
Utilitários para o sistema de supervisório.
"""

from .comm_map_loader import (
    load_comm_map,
    normalize_comm_map_to_array,
    normalize_comm_map_to_grouped,
    get_tags_by_db
)

__all__ = [
    'load_comm_map',
    'normalize_comm_map_to_array',
    'normalize_comm_map_to_grouped',
    'get_tags_by_db'
]


#!/usr/bin/env python3
"""
Teste do caminho dos templates
"""

import os

# Simula o caminho que está sendo usado no app/__init__.py
base_dir = os.path.dirname(os.path.dirname(__file__))
template_dir = os.path.join(base_dir, 'templates')
static_dir = os.path.join(base_dir, 'static')

print(f"Diretório atual: {os.getcwd()}")
print(f"Base dir: {base_dir}")
print(f"Template dir: {template_dir}")
print(f"Static dir: {static_dir}")
print(f"Template dir existe: {os.path.exists(template_dir)}")
print(f"Static dir existe: {os.path.exists(static_dir)}")

if os.path.exists(template_dir):
    print(f"Arquivos em templates: {os.listdir(template_dir)}")
    print(f"dashboard.html existe: {os.path.exists(os.path.join(template_dir, 'dashboard.html'))}")

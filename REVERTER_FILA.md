# Revertendo Sistema de Fila

## Problema

A implementação da fila de processos no backend está causando timeouts. A thread worker não está conseguindo processar as requisições devido a problemas de contexto do Flask (`current_app` não disponível nas threads).

## Solução Proposta

**REVERTER** para a abordagem anterior que funcionava:

1. ❌ **Remover** sistema de fila (`_tag_write_queues`, `_queue_workers`, `enqueue_write`, `_process_write_queue`)
2. ✅ **Manter** apenas o lock por WORD (`get_word_lock`)
3. ✅ **Manter** read-modify-write dentro do lock
4. ✅ **Manter** delays no frontend e backend

## Motivo

O lock por WORD já é suficiente para evitar race conditions. A fila adiciona complexidade desnecessária e problemas de threading com Flask.

## Implementação

Voltar ao código de `write_word_bit` **SEM** `enqueue_write`, chamando `_execute_write_word_bit` diretamente.


"""
Identificadores opacos para todo lo que viaja en una URL.

UUID v7 (RFC 9562): aleatorio para quien lo ve, pero ordenado por tiempo, así los
índices de Postgres no se fragmentan como con un v4. Nunca se expone el número
correlativo de un caso ni un id autoincremental: un link no puede dejar adivinar el
siguiente.
"""

import os
import time
import uuid


def uuid7() -> uuid.UUID:
    ms = time.time_ns() // 1_000_000
    aleatorio = int.from_bytes(os.urandom(10), 'big')
    valor = (ms & ((1 << 48) - 1)) << 80
    valor |= 0x7 << 76  # versión
    valor |= ((aleatorio >> 68) & 0xFFF) << 64
    valor |= 0b10 << 62  # variante RFC
    valor |= aleatorio & ((1 << 62) - 1)
    return uuid.UUID(int=valor)

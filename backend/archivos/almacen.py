"""
Dónde viven los archivos (escaneos, fotos, órdenes).

- En producción: Cloudflare R2 (API de S3). El navegador sube DIRECTO a R2 con una URL
  firmada que vence en una hora: un escaneo de 100 MB no pasa por el servidor de Django.
  La URL exige el tamaño y el SHA-256 declarados, así que R2 rechaza un archivo distinto.
- En desarrollo y en los tests: una carpeta local con el mismo contrato (URL firmada, PUT,
  tamaño y hash controlados), para no depender de Docker ni de una cuenta de R2.

Nunca hay archivos públicos: cada descarga es una URL que vence.
"""

import base64
import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from django.conf import settings
from django.core import signing

VIGENCIA_SUBIDA = 60 * 60
VIGENCIA_DESCARGA = 10 * 60
_SAL = 'lupalab.archivos'


@dataclass
class Subida:
    url: str
    metodo: str = 'PUT'
    encabezados: dict = field(default_factory=dict)


class AlmacenLocal:
    """Carpeta local. Las URLs apuntan a vistas de Django que validan la firma."""

    def __init__(self, carpeta=None):
        self.carpeta = Path(carpeta or settings.ARCHIVOS_DIR)

    def _ruta(self, clave):
        ruta = (self.carpeta / clave).resolve()
        if self.carpeta.resolve() not in ruta.parents:
            raise ValueError('Clave fuera de la carpeta de archivos.')
        return ruta

    def subida(self, clave, tamano, sha256, tipo_contenido):
        token = signing.dumps({'clave': clave, 'tamano': tamano, 'sha256': sha256}, salt=_SAL)
        return Subida(url=f'/api/archivos/local/{token}', encabezados={'Content-Type': tipo_contenido})

    @staticmethod
    def leer_token_subida(token):
        return signing.loads(token, salt=_SAL, max_age=VIGENCIA_SUBIDA)

    def guardar(self, clave, contenido: bytes):
        ruta = self._ruta(clave)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_bytes(contenido)

    def tamano(self, clave):
        ruta = self._ruta(clave)
        return ruta.stat().st_size if ruta.exists() else None

    def abrir(self, clave):
        return self._ruta(clave).open('rb')

    def url_descarga(self, clave, nombre):
        token = signing.dumps({'clave': clave, 'nombre': nombre}, salt=_SAL + '.descarga')
        return f'/api/archivos/local/descarga/{token}'

    @staticmethod
    def leer_token_descarga(token):
        return signing.loads(token, salt=_SAL + '.descarga', max_age=VIGENCIA_DESCARGA)


class AlmacenR2:
    def __init__(self):
        import boto3
        from botocore.config import Config

        self.balde = settings.R2_BALDE
        self.s3 = boto3.client(
            's3',
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_CLAVE,
            aws_secret_access_key=settings.R2_SECRETO,
            region_name='auto',
            config=Config(signature_version='s3v4'),
        )

    def subida(self, clave, tamano, sha256, tipo_contenido):
        checksum = base64.b64encode(bytes.fromhex(sha256)).decode()
        url = self.s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': self.balde,
                'Key': clave,
                'ContentLength': tamano,
                'ContentType': tipo_contenido,
                'ChecksumSHA256': checksum,
            },
            ExpiresIn=VIGENCIA_SUBIDA,
        )
        return Subida(
            url=url,
            encabezados={'Content-Type': tipo_contenido, 'x-amz-checksum-sha256': checksum},
        )

    def tamano(self, clave):
        try:
            return self.s3.head_object(Bucket=self.balde, Key=clave)['ContentLength']
        except self.s3.exceptions.ClientError:
            return None

    def abrir(self, clave):
        return self.s3.get_object(Bucket=self.balde, Key=clave)['Body']

    def url_descarga(self, clave, nombre):
        return self.s3.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': self.balde,
                'Key': clave,
                'ResponseContentDisposition': f'attachment; filename="{nombre}"',
            },
            ExpiresIn=VIGENCIA_DESCARGA,
        )


def almacen():
    return AlmacenR2() if settings.ARCHIVOS_BACKEND == 'r2' else AlmacenLocal()


def sha256_de(contenido: bytes) -> str:
    return hashlib.sha256(contenido).hexdigest()

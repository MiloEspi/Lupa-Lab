"""
Subida en dos pasos: (1) se pide una URL firmada declarando nombre, tamaño y SHA-256;
(2) el navegador sube el archivo directo y avisa que terminó; el servidor comprueba que
llegó entero. Recién ahí el archivo cuenta para el caso.
"""

import csv
import io
import re
import tempfile
import zipfile

from django.db import transaction
from django.db.models import Max
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils.text import get_valid_filename
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import BaseParser
from rest_framework.response import Response
from rest_framework.views import APIView

from auditoria.servicios import registrar
from casos.models import Caso
from cuentas.permisos import Accion, LaboratorioScopedMixin, exigir

from .almacen import AlmacenLocal, almacen, sha256_de
from .models import Archivo, NotaEscaneo, VersionEscaneo

#: Escaneos de arcada completa rondan 20-80 MB; con margen para PLY con color.
TAMANO_MAXIMO = 300 * 1024 * 1024

FORMATOS = {
    Archivo.Tipo.ESCANEO: {'stl', 'ply', 'obj'},
    Archivo.Tipo.DISENO: {'stl', 'ply', 'obj', 'zip'},
    Archivo.Tipo.FOTO: {'jpg', 'jpeg', 'png', 'webp', 'heic'},
    Archivo.Tipo.ORDEN: {'pdf', 'jpg', 'jpeg', 'png'},
    Archivo.Tipo.OTRO: {'pdf', 'jpg', 'jpeg', 'png', 'zip', 'stl', 'ply', 'obj'},
}
MALLAS = {'stl', 'ply', 'obj'}
TIPOS_CONTENIDO = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'zip': 'application/zip',
}


def _etapa_actual(caso):
    primero = caso.trabajos.prefetch_related('etapas').first()
    etapa = primero.etapa_actual if primero else None
    return etapa.nombre if etapa else ''


# --- Serializers ---------------------------------------------------------------------------


class ArchivoSerializer(serializers.ModelSerializer):
    subido_por = serializers.CharField(source='subido_por.nombre_visible', read_only=True)

    class Meta:
        model = Archivo
        fields = [
            'id',
            'tipo',
            'nombre',
            'formato',
            'tamano',
            'sha256',
            'estado',
            'etapa',
            'categoria',
            'comentario',
            'version',
            'subido_por',
            'creado',
        ]
        read_only_fields = fields


class PedidoSubidaSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=Archivo.Tipo.choices)
    nombre = serializers.CharField(max_length=200)
    tamano = serializers.IntegerField(
        min_value=1,
        max_value=TAMANO_MAXIMO,
        error_messages={
            'max_value': 'El archivo pesa más de 300 MB.',
        },
    )
    categoria = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    comentario = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    sha256 = serializers.RegexField(r'^[0-9a-f]{64}$', error_messages={'invalid': 'Hash SHA-256 inválido.'})

    def validate(self, datos):
        formato = datos['nombre'].rsplit('.', 1)[-1].lower() if '.' in datos['nombre'] else ''
        permitidos = FORMATOS[datos['tipo']]
        if formato not in permitidos:
            raise ValidationError({'nombre': [f'Para este tipo se aceptan: {", ".join(sorted(permitidos))}.']})
        datos['formato'] = formato
        return datos


class SubidaSerializer(serializers.Serializer):
    url = serializers.CharField()
    metodo = serializers.CharField()
    encabezados = serializers.DictField(child=serializers.CharField())


class ArchivoConSubidaSerializer(serializers.Serializer):
    archivo = ArchivoSerializer()
    subida = SubidaSerializer()


class DescargaSerializer(serializers.Serializer):
    url = serializers.CharField()


class NotaSerializer(serializers.ModelSerializer):
    autor = serializers.CharField(source='autor.usuario.nombre_visible', read_only=True)
    es_mia = serializers.SerializerMethodField()

    class Meta:
        model = NotaEscaneo
        fields = ['id', 'numero', 'x', 'y', 'z', 'normal', 'texto', 'visibilidad', 'etapa', 'autor', 'es_mia', 'creado']
        read_only_fields = ['id', 'numero', 'etapa', 'autor', 'es_mia', 'creado']

    def validate_normal(self, valor):
        if valor in (None, []):
            return []
        if not isinstance(valor, list) or len(valor) != 3 or not all(isinstance(x, (int, float)) for x in valor):
            raise serializers.ValidationError('La normal son tres números.')
        return [round(float(x), 4) for x in valor]

    def get_es_mia(self, nota) -> bool:
        membresia = self.context.get('membresia')
        return membresia is not None and nota.autor_id == membresia.id


class VersionSerializer(serializers.ModelSerializer):
    archivos = ArchivoSerializer(many=True, read_only=True)
    notas = NotaSerializer(many=True, read_only=True)
    creada_por = serializers.CharField(source='creada_por.nombre_visible', read_only=True)

    class Meta:
        model = VersionEscaneo
        fields = ['id', 'numero', 'origen', 'descripcion', 'incluye_base', 'creada_por', 'creado', 'archivos', 'notas']
        read_only_fields = fields


class VersionNuevaSerializer(serializers.Serializer):
    origen = serializers.ChoiceField(choices=VersionEscaneo.Origen.choices)
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    archivos = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    incluye_base = serializers.BooleanField(required=False, default=True)


# --- Archivos ------------------------------------------------------------------------------


class _DelCaso(LaboratorioScopedMixin, APIView):
    def caso(self, request, pk):
        return self.get_scoped_object(request, Caso, pk=pk)


class ArchivosView(_DelCaso):
    @extend_schema(responses=ArchivoSerializer(many=True))
    def get(self, request, pk):
        caso = self.caso(request, pk)
        archivos = caso.archivos.filter(estado=Archivo.Estado.LISTO).select_related('subido_por')
        return Response(ArchivoSerializer(archivos, many=True).data)

    @extend_schema(request=PedidoSubidaSerializer, responses={201: ArchivoConSubidaSerializer})
    def post(self, request, pk):
        caso = self.caso(request, pk)
        exigir(self.get_membresia(request), Accion.COMENTAR, 'Tu rol no puede subir archivos.')
        datos = PedidoSubidaSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        d = datos.validated_data
        archivo = Archivo(
            laboratorio=caso.laboratorio,
            caso=caso,
            tipo=d['tipo'],
            nombre=d['nombre'],
            formato=d['formato'],
            tamano=d['tamano'],
            sha256=d['sha256'],
            subido_por=request.user,
            etapa=_etapa_actual(caso),
            categoria=d['categoria'],
            comentario=d['comentario'],
        )
        # La clave no lleva datos del paciente: laboratorio/caso/archivo y el nombre saneado.
        archivo.clave = f'{caso.laboratorio_id}/{caso.pk}/{archivo.pk}/{get_valid_filename(d["nombre"])[:120]}'
        archivo.save()
        tipo_contenido = TIPOS_CONTENIDO.get(d['formato'], 'application/octet-stream')
        subida = almacen().subida(archivo.clave, archivo.tamano, archivo.sha256, tipo_contenido)
        return Response(
            {'archivo': ArchivoSerializer(archivo).data, 'subida': subida.__dict__},
            status=status.HTTP_201_CREATED,
        )


class ConfirmarArchivoView(_DelCaso):
    @extend_schema(request=None, responses=ArchivoSerializer)
    def post(self, request, pk, archivo):
        caso = self.caso(request, pk)
        archivo = get_object_or_404(caso.archivos, pk=archivo)
        if archivo.estado == Archivo.Estado.LISTO:
            return Response(ArchivoSerializer(archivo).data)
        tamano = almacen().tamano(archivo.clave)
        if tamano is None:
            raise ValidationError({'detail': 'El archivo todavía no llegó. Probá subirlo de nuevo.'})
        if tamano != archivo.tamano:
            raise ValidationError({'detail': 'El archivo llegó incompleto. Probá subirlo de nuevo.'})
        archivo.estado = Archivo.Estado.LISTO
        archivo.save(update_fields=['estado', 'actualizado'])
        registrar(request, 'archivo_subido', caso, despues={'archivo': archivo.nombre, 'tipo': archivo.tipo})
        return Response(ArchivoSerializer(archivo).data)


class ContenidoView(_DelCaso):
    """El archivo en sí, con una URL que no cambia (el visor la usa de clave de caché). En
    desarrollo lo sirve Django; con R2 redirige a una URL firmada que vence."""

    @extend_schema(responses={(200, 'application/octet-stream'): bytes})
    def get(self, request, pk, archivo):
        caso = self.caso(request, pk)
        archivo = get_object_or_404(caso.archivos, pk=archivo, estado=Archivo.Estado.LISTO)
        tienda = almacen()
        if isinstance(tienda, AlmacenLocal):
            respuesta = FileResponse(tienda.abrir(archivo.clave), filename=archivo.nombre)
            respuesta['Cache-Control'] = 'private, max-age=3600'
            return respuesta
        return HttpResponseRedirect(tienda.url_descarga(archivo.clave, archivo.nombre))


class DescargaView(_DelCaso):
    @extend_schema(responses=DescargaSerializer)
    def get(self, request, pk, archivo):
        caso = self.caso(request, pk)
        archivo = get_object_or_404(caso.archivos, pk=archivo, estado=Archivo.Estado.LISTO)
        return Response({'url': almacen().url_descarga(archivo.clave, archivo.nombre)})


class _Binario(BaseParser):
    media_type = '*/*'

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()


class SubidaLocalView(APIView):
    """Solo en desarrollo: hace de R2. Pide sesión además de la firma (un link solo no alcanza)."""

    parser_classes = [_Binario]

    @extend_schema(exclude=True)
    def put(self, request, token):
        try:
            datos = AlmacenLocal.leer_token_subida(token)
        except Exception as e:
            raise PermissionDenied('El link de subida venció.') from e
        contenido = request.body
        if len(contenido) != datos['tamano'] or sha256_de(contenido) != datos['sha256']:
            raise ValidationError({'detail': 'El archivo no coincide con lo declarado (tamaño o hash).'})
        AlmacenLocal().guardar(datos['clave'], contenido)
        return Response(status=status.HTTP_200_OK)


class DescargaLocalView(LaboratorioScopedMixin, APIView):
    @extend_schema(exclude=True)
    def get(self, request, token):
        try:
            datos = AlmacenLocal.leer_token_descarga(token)
        except Exception as e:
            raise Http404 from e
        # Además de la firma, el archivo tiene que ser del laboratorio de la sesión.
        if not datos['clave'].startswith(f'{self.get_laboratorio(request).pk}/'):
            raise Http404
        return FileResponse(AlmacenLocal().abrir(datos['clave']), as_attachment=True, filename=datos['nombre'])


# --- Versiones del escaneo y notas ---------------------------------------------------------


def _versiones(caso):
    return caso.versiones.select_related('creada_por').prefetch_related(
        'archivos__subido_por',
        'notas__autor__usuario',
    )


class VersionesView(_DelCaso):
    @extend_schema(responses=VersionSerializer(many=True))
    def get(self, request, pk):
        caso = self.caso(request, pk)
        contexto = {'membresia': request.membresia}
        return Response(VersionSerializer(_versiones(caso), many=True, context=contexto).data)

    @extend_schema(request=VersionNuevaSerializer, responses={201: VersionSerializer})
    def post(self, request, pk):
        caso = self.caso(request, pk)
        datos = VersionNuevaSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        origen = datos.validated_data['origen']
        accion = Accion.CREAR_CASO if origen == VersionEscaneo.Origen.INICIAL else Accion.DISENAR
        exigir(self.get_membresia(request), accion, 'Tu rol no puede cargar esta versión del escaneo.')
        with transaction.atomic():
            caso = Caso.objects.select_for_update().get(pk=caso.pk)
            existe_inicial = caso.versiones.filter(origen=VersionEscaneo.Origen.INICIAL).exists()
            if origen == VersionEscaneo.Origen.INICIAL and existe_inicial:
                raise ValidationError({'origen': ['El escaneo inicial ya está cargado y no se reemplaza.']})
            if origen == VersionEscaneo.Origen.CAD and not existe_inicial:
                raise ValidationError({'origen': ['Primero tiene que estar el escaneo del odontólogo.']})
            archivos = list(caso.archivos.filter(pk__in=datos.validated_data['archivos']))
            if len(archivos) != len(set(datos.validated_data['archivos'])):
                raise ValidationError({'archivos': ['Algún archivo no es de este caso.']})
            for a in archivos:
                if a.estado != Archivo.Estado.LISTO or a.version_id or a.formato not in MALLAS | {'zip'}:
                    raise ValidationError({'archivos': [f'{a.nombre} no se puede usar en una versión.']})
            numero = (caso.versiones.aggregate(m=Max('numero'))['m'] or 0) + 1
            version = VersionEscaneo.objects.create(
                caso=caso,
                numero=numero,
                origen=origen,
                descripcion=datos.validated_data['descripcion'],
                incluye_base=datos.validated_data['incluye_base'],
                creada_por=request.user,
            )
            Archivo.objects.filter(pk__in=[a.pk for a in archivos]).update(version=version)
        registrar(request, 'version_escaneo_creada', caso, despues={'numero': numero, 'origen': origen})
        version = _versiones(caso).get(pk=version.pk)
        return Response(VersionSerializer(version, context={'membresia': request.membresia}).data, status=201)


class NotasView(_DelCaso):
    @extend_schema(request=NotaSerializer, responses={201: NotaSerializer})
    def post(self, request, pk, version):
        caso = self.caso(request, pk)
        exigir(self.get_membresia(request), Accion.COMENTAR, 'Tu rol no puede dejar notas.')
        version = get_object_or_404(caso.versiones, pk=version)
        datos = NotaSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        with transaction.atomic():
            Caso.objects.select_for_update().get(pk=caso.pk)
            numero = (NotaEscaneo.objects.filter(version__caso=caso).aggregate(m=Max('numero'))['m'] or 0) + 1
            nota = datos.save(version=version, numero=numero, autor=request.membresia, etapa=_etapa_actual(caso))
        registrar(request, 'nota_escaneo', caso, despues={'version': version.numero, 'nota': numero})
        return Response(NotaSerializer(nota, context={'membresia': request.membresia}).data, status=201)


class NotaView(_DelCaso):
    http_method_names = ['patch', 'options']

    @extend_schema(request=NotaSerializer, responses=NotaSerializer)
    def patch(self, request, pk, version, nota):
        caso = self.caso(request, pk)
        nota = get_object_or_404(NotaEscaneo, pk=nota, version__caso=caso, version_id=version)
        if nota.autor_id != request.membresia.id:
            raise PermissionDenied('Una nota la cambia quien la escribió.')
        datos = NotaSerializer(nota, data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        antes = {'texto': nota.texto, 'visibilidad': nota.visibilidad}
        nota = datos.save()
        registrar(
            request, 'nota_cambiada', caso, antes=antes, despues={'texto': nota.texto, 'visibilidad': nota.visibilidad}
        )
        return Response(NotaSerializer(nota, context={'membresia': request.membresia}).data)


class ZipVersionView(_DelCaso):
    """La versión lista para abrir en exocad: las mallas sueltas y las notas en CSV (P8)."""

    @extend_schema(responses={(200, 'application/zip'): bytes})
    def get(self, request, pk, version):
        caso = self.caso(request, pk)
        version = get_object_or_404(_versiones(caso), pk=version)
        destino = tempfile.SpooledTemporaryFile(max_size=50 * 1024 * 1024)
        tienda = almacen()
        with zipfile.ZipFile(destino, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            for a in version.archivos.all():
                with tienda.abrir(a.clave) as origen, z.open(a.nombre, 'w', force_zip64=True) as salida:
                    while bloque := origen.read(1024 * 1024):
                        salida.write(bloque)
            z.writestr('notas.csv', _csv_notas(version))
        destino.seek(0)
        nombre = re.sub(r'[^A-Za-z0-9-]', '', caso.codigo) + f'-v{version.numero}.zip'
        registrar(request, 'version_descargada', caso, despues={'version': version.numero})
        return FileResponse(destino, as_attachment=True, filename=nombre, content_type='application/zip')


def _csv_notas(version):
    texto = io.StringIO()
    escritor = csv.writer(texto)
    escritor.writerow(['numero', 'x_mm', 'y_mm', 'z_mm', 'texto', 'autor', 'etapa', 'visibilidad', 'creada'])
    for n in version.notas.all():
        escritor.writerow(
            [
                n.numero,
                n.x,
                n.y,
                n.z,
                n.texto,
                n.autor.usuario.nombre_visible,
                n.etapa,
                n.visibilidad,
                n.creado.isoformat(timespec='minutes'),
            ]
        )
    # Con BOM: Excel en castellano lo abre con tildes bien.
    return '﻿' + texto.getvalue()

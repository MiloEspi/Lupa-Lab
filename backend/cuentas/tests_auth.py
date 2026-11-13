import re
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from auditoria.models import Evento, EventoInmutable
from conftest import PASSWORD
from cuentas.models import Invitacion, Membresia, Rol, SesionDispositivo, Usuario

pytestmark = pytest.mark.django_db


# --- Ingreso y sesión -------------------------------------------------------------


def test_sin_sesion_contesta_401(cliente):
    assert cliente.get('/api/auth/yo').status_code == 401


def test_salud_no_pide_sesion(cliente):
    assert cliente.get('/api/salud').json() == {'estado': 'ok'}


def test_ingresa_y_queda_en_su_unico_laboratorio(cliente, entrar, recepcion):
    datos = entrar(recepcion).json()
    assert datos['membresia_activa']['laboratorio']['nombre'] == 'Laboratorio A'
    assert 'crear_caso' in datos['permisos']
    assert 'gestionar_equipo' not in datos['permisos']
    assert SesionDispositivo.objects.filter(usuario=recepcion.usuario).count() == 1


def test_el_mail_no_distingue_mayusculas(cliente, recepcion):
    respuesta = cliente.post('/api/auth/ingresar', {'email': 'RITA@Lab-A.test', 'password': PASSWORD}, format='json')
    assert respuesta.status_code == 200


def test_contrasena_incorrecta_da_el_mismo_error_que_mail_inexistente(cliente, recepcion):
    mal = cliente.post('/api/auth/ingresar', {'email': 'rita@lab-a.test', 'password': 'otra-cosa-123'}, format='json')
    nadie = cliente.post('/api/auth/ingresar', {'email': 'nadie@lab.test', 'password': 'otra-cosa-123'}, format='json')
    assert mal.status_code == nadie.status_code == 400
    assert mal.json() == nadie.json()


def test_dado_de_baja_no_entra(cliente, laboratorio, crear_persona):
    baja = crear_persona(laboratorio, 'baja@lab-a.test', [Rol.CAD], activa=False)
    respuesta = cliente.post('/api/auth/ingresar', {'email': baja.usuario.email, 'password': PASSWORD}, format='json')
    assert respuesta.status_code == 403


def test_baja_con_la_sesion_abierta_lo_saca_en_el_proximo_pedido(cliente, entrar, recepcion):
    entrar(recepcion)
    Membresia.objects.filter(pk=recepcion.pk).update(activa=False)
    assert cliente.get('/api/auth/yo').status_code == 401


def test_csrf_obligatorio_con_sesion(recepcion):
    cliente = APIClient(enforce_csrf_checks=True)
    cliente.get('/api/auth/csrf')
    token = cliente.cookies['csrftoken'].value
    datos = {'email': recepcion.usuario.email, 'password': PASSWORD}
    assert cliente.post('/api/auth/ingresar', datos, format='json', HTTP_X_CSRFTOKEN=token).status_code == 200
    # Con sesión abierta, un POST sin el header CSRF se rechaza.
    assert cliente.post('/api/auth/salir').status_code == 403


def test_salir_cierra_la_sesion_y_borra_el_dispositivo(cliente, entrar, recepcion):
    entrar(recepcion)
    assert cliente.post('/api/auth/salir').status_code == 204
    assert cliente.get('/api/auth/yo').status_code == 401
    assert not SesionDispositivo.objects.filter(usuario=recepcion.usuario).exists()


def test_cerrar_una_sesion_desde_otro_dispositivo(entrar, cliente, recepcion):
    celular = APIClient()
    celular.post('/api/auth/ingresar', {'email': recepcion.usuario.email, 'password': PASSWORD}, format='json')
    entrar(recepcion)
    sesiones = cliente.get('/api/auth/sesiones').json()
    assert len(sesiones) == 2
    ajena = next(s for s in sesiones if not s['esta'])
    assert cliente.delete(f'/api/auth/sesiones/{ajena["id"]}').status_code == 204
    assert celular.get('/api/auth/yo').status_code == 401
    assert cliente.get('/api/auth/yo').status_code == 200


# --- Varios laboratorios ----------------------------------------------------------


def test_con_dos_laboratorios_hay_que_elegir(cliente, entrar, laboratorio, otro_laboratorio, crear_persona):
    a = crear_persona(laboratorio, 'tec@lab.test', [Rol.CAD])
    crear_persona(otro_laboratorio, 'tec@lab.test', [Rol.CONTROL])
    datos = entrar(a).json()
    assert datos['membresia_activa'] is None
    assert datos['permisos'] == []
    assert len(datos['membresias']) == 2

    elegido = cliente.post('/api/auth/laboratorio', {'laboratorio': str(otro_laboratorio.id)}, format='json').json()
    assert elegido['membresia_activa']['laboratorio']['nombre'] == 'Laboratorio B'
    assert 'controlar' in elegido['permisos'] and 'disenar' not in elegido['permisos']
    # Queda elegido en la sesión.
    assert cliente.get('/api/auth/yo').json()['membresia_activa']['laboratorio']['id'] == str(otro_laboratorio.id)


def test_no_puede_elegir_un_laboratorio_ajeno(cliente, entrar, recepcion, otro_laboratorio):
    entrar(recepcion)
    respuesta = cliente.post('/api/auth/laboratorio', {'laboratorio': str(otro_laboratorio.id)}, format='json')
    assert respuesta.status_code == 404


# --- Contraseña -------------------------------------------------------------------


def _link(texto, ruta):
    return re.search(rf'/{ruta}/(\S+)', texto).group(1)


def test_recuperar_contrasena_completo(cliente, entrar, recepcion):
    otro = APIClient()
    otro.post('/api/auth/ingresar', {'email': recepcion.usuario.email, 'password': PASSWORD}, format='json')

    assert cliente.post('/api/auth/recuperar', {'email': 'rita@lab-a.test'}, format='json').status_code == 204
    uid, token = _link(mail.outbox[0].body, 'restablecer').split('/')
    nueva = 'otra-clave-bien-larga'
    datos = {'uid': uid, 'token': token, 'password': nueva}
    assert cliente.post('/api/auth/restablecer', datos, format='json').status_code == 204
    # La sesión vieja quedó cerrada y el link no sirve dos veces.
    assert otro.get('/api/auth/yo').status_code == 401
    assert cliente.post('/api/auth/restablecer', datos, format='json').status_code == 400
    entrar(recepcion, password=nueva)


def test_recuperar_no_dice_si_el_mail_existe(cliente):
    assert cliente.post('/api/auth/recuperar', {'email': 'nadie@lab.test'}, format='json').status_code == 204
    assert mail.outbox == []


def test_cambiar_contrasena_cierra_las_otras_sesiones(cliente, entrar, recepcion):
    otro = APIClient()
    otro.post('/api/auth/ingresar', {'email': recepcion.usuario.email, 'password': PASSWORD}, format='json')
    entrar(recepcion)
    mal = cliente.post('/api/auth/contrasena', {'actual': 'no-es', 'password': 'otra-clave-bien-larga'}, format='json')
    assert mal.status_code == 400
    ok = cliente.post('/api/auth/contrasena', {'actual': PASSWORD, 'password': 'otra-clave-bien-larga'}, format='json')
    assert ok.status_code == 204
    assert cliente.get('/api/auth/yo').status_code == 200
    assert otro.get('/api/auth/yo').status_code == 401


def test_contrasena_debil_se_rechaza(cliente, entrar, recepcion):
    entrar(recepcion)
    respuesta = cliente.post('/api/auth/contrasena', {'actual': PASSWORD, 'password': '12345678'}, format='json')
    assert respuesta.status_code == 400


# --- Invitaciones -----------------------------------------------------------------


def _invitar(cliente, email='nuevo@lab-a.test', roles=('cad',)):
    datos = {'email': email, 'nombre': 'Nico', 'roles': list(roles)}
    return cliente.post('/api/equipo/invitaciones', datos, format='json')


def test_solo_administracion_invita(cliente, entrar, recepcion):
    entrar(recepcion)
    assert _invitar(cliente).status_code == 403


def test_invitacion_completa(cliente, entrar, admin):
    entrar(admin)
    assert _invitar(cliente).status_code == 201
    token = _link(mail.outbox[0].body, 'invitacion')
    assert token not in str(Invitacion.objects.values_list('token_hash', flat=True))

    nuevo = APIClient()
    vista = nuevo.get(f'/api/auth/invitaciones/{token}').json()
    assert vista == {
        'laboratorio': 'Laboratorio A',
        'email': 'nuevo@lab-a.test',
        'nombre': 'Nico',
        'apellido': '',
        'ya_tiene_usuario': False,
    }
    datos = nuevo.post(f'/api/auth/invitaciones/{token}', {'password': 'clave-del-nuevo-123'}, format='json').json()
    assert datos['membresia_activa']['roles'] == ['cad']
    assert nuevo.get('/api/auth/yo').status_code == 200
    # El link sirve una sola vez.
    assert APIClient().get(f'/api/auth/invitaciones/{token}').status_code == 404


def test_invitacion_vencida_no_sirve(cliente, entrar, admin):
    entrar(admin)
    _invitar(cliente)
    Invitacion.objects.update(vence=timezone.now() - timedelta(minutes=1))
    token = _link(mail.outbox[0].body, 'invitacion')
    assert APIClient().get(f'/api/auth/invitaciones/{token}').status_code == 404


def test_invitar_de_nuevo_anula_el_link_anterior(cliente, entrar, admin):
    entrar(admin)
    _invitar(cliente)
    _invitar(cliente)
    viejo, nuevo = (_link(m.body, 'invitacion') for m in mail.outbox)
    assert APIClient().get(f'/api/auth/invitaciones/{viejo}').status_code == 404
    assert APIClient().get(f'/api/auth/invitaciones/{nuevo}').status_code == 200


def test_quien_ya_tiene_usuario_acepta_con_su_contrasena(cliente, entrar, admin, otro_laboratorio, crear_persona):
    crear_persona(otro_laboratorio, 'nuevo@lab-a.test', [Rol.CONTROL])
    entrar(admin)
    _invitar(cliente)
    token = _link(mail.outbox[0].body, 'invitacion')
    nuevo = APIClient()
    assert nuevo.get(f'/api/auth/invitaciones/{token}').json()['ya_tiene_usuario'] is True
    mal = nuevo.post(f'/api/auth/invitaciones/{token}', {'password': 'cualquier-otra-123'}, format='json')
    assert mal.status_code == 400
    ok = nuevo.post(f'/api/auth/invitaciones/{token}', {'password': PASSWORD}, format='json')
    assert ok.json()['membresia_activa']['laboratorio']['nombre'] == 'Laboratorio A'
    assert Usuario.objects.filter(email='nuevo@lab-a.test').count() == 1


def test_no_se_invita_a_quien_ya_esta(cliente, entrar, admin, recepcion):
    entrar(admin)
    assert _invitar(cliente, email='RITA@lab-a.test').status_code == 400


# --- Equipo -----------------------------------------------------------------------


def test_administracion_cambia_roles_y_queda_registrado(cliente, entrar, admin, recepcion):
    entrar(admin)
    datos = {'roles': ['revision', 'recepcion']}
    respuesta = cliente.patch(f'/api/equipo/miembros/{recepcion.id}', datos, format='json')
    assert respuesta.json()['roles'] == ['recepcion', 'revision']
    evento = Evento.objects.get(accion='miembro_cambiado')
    assert evento.antes == {'roles': ['recepcion'], 'activa': True}
    assert evento.nombre_usuario == admin.usuario.nombre_visible


def test_no_se_puede_tocar_a_alguien_de_otro_laboratorio(cliente, entrar, admin, otro_laboratorio, crear_persona):
    ajeno = crear_persona(otro_laboratorio, 'ajeno@lab-b.test', [Rol.CAD])
    entrar(admin)
    assert cliente.patch(f'/api/equipo/miembros/{ajeno.id}', {'activa': False}, format='json').status_code == 404
    assert all(m['id'] != str(ajeno.id) for m in cliente.get('/api/equipo/miembros').json())


def test_siempre_queda_alguien_con_administracion(cliente, entrar, admin):
    entrar(admin)
    assert cliente.patch(f'/api/equipo/miembros/{admin.id}', {'roles': ['cad']}, format='json').status_code == 400
    assert cliente.patch(f'/api/equipo/miembros/{admin.id}', {'activa': False}, format='json').status_code == 400


# --- Auditoría --------------------------------------------------------------------


def test_auditoria_solo_para_administracion_y_supervision(cliente, entrar, admin, recepcion):
    entrar(recepcion)
    assert cliente.get('/api/auditoria/eventos').status_code == 403
    cliente.post('/api/auth/salir')
    entrar(admin)
    acciones = [e['accion'] for e in cliente.get('/api/auditoria/eventos').json()]
    assert 'ingreso' in acciones


def test_auditoria_no_muestra_eventos_de_otro_laboratorio(cliente, entrar, admin, otro_laboratorio, crear_persona):
    ajeno = crear_persona(otro_laboratorio, 'ajeno@lab-b.test', [Rol.ADMINISTRACION])
    otro = APIClient()
    otro.post('/api/auth/ingresar', {'email': ajeno.usuario.email, 'password': PASSWORD}, format='json')
    entrar(admin)
    nombres = {e['nombre_usuario'] for e in cliente.get('/api/auditoria/eventos').json()}
    assert ajeno.usuario.nombre_visible not in nombres


def test_un_evento_no_se_edita_ni_se_borra(entrar, recepcion):
    entrar(recepcion)
    evento = Evento.objects.first()
    evento.accion = 'otra'
    with pytest.raises(EventoInmutable):
        evento.save()
    with pytest.raises(EventoInmutable):
        evento.delete()

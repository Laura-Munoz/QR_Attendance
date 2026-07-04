// =============================================================================
// app.js — PWA "Vida de Yoguis"
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw5HqxUbHvT9l-SFcX7P6fZprZRHCTlLSE80IfnU6V8tBPNLCdNbf0Bu8ScIlDyDa4B/exec';


// ─────────────────────────────────────────────────────────────────────────────
//  ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────────────────────
const app = {
  pantallaActual     : 'pantalla-home',
  historial          : [],
  // Escáner
  scanner            : null,
  scannerActivo      : false,
  scanPausado        : false,
  // Resultado de escaneo
  alumnoIdActual     : null,
  nombreActual       : '',
  // Ficha de alumna
  fichaAlumnoId      : null,
  fichaActivo        : true,
  fichaClasesBase    : 0,
  fichaClasesDisplay : 0,
  // Dashboard
  dashboardDatos     : null,
  // Nueva alumna (para pantalla QR generado)
  nuevoNombre        : '',
  nuevoTelefono      : '',
  nuevoId            : '',
  // Alumnas cargadas en Ver alumnas
  alumnasCacheTotal  : [],
  alumnasFiltroActivo: 'activas',
};


// =============================================================================
//  NAVEGACIÓN
// =============================================================================

function mostrarPantalla(id, agregarHistorial = true) {
  if (app.pantallaActual === 'pantalla-escanear' && id !== 'pantalla-escanear') {
    detenerScanner();
  }

  const anterior = document.getElementById(app.pantallaActual);
  if (anterior) anterior.classList.add('oculta');

  const nueva = document.getElementById(id);
  if (!nueva) { console.error('Pantalla no encontrada:', id); return; }
  nueva.classList.remove('oculta');

  if (agregarHistorial && app.pantallaActual !== id) {
    app.historial.push(app.pantallaActual);
  }
  app.pantallaActual = id;

  const btnVolver = document.getElementById('btn-volver');
  if (id === 'pantalla-home') {
    btnVolver.classList.add('oculto');
    app.historial = [];
  } else {
    btnVolver.classList.remove('oculto');
  }

  if (id === 'pantalla-escanear') iniciarScanner();

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function volverAtras() {
  const destino = app.historial.pop() || 'pantalla-home';
  mostrarPantalla(destino, false);
}


// =============================================================================
//  SPINNER
// =============================================================================

let _peticionesActivas = 0;

function mostrarSpinner() {
  _peticionesActivas++;
  document.getElementById('spinner').classList.remove('oculto');
}

function ocultarSpinner() {
  _peticionesActivas = Math.max(0, _peticionesActivas - 1);
  if (_peticionesActivas === 0) document.getElementById('spinner').classList.add('oculto');
}


// =============================================================================
//  TOAST
// =============================================================================

let _toastTimer = null;

function mostrarToast(mensaje, duracion = 3200) {
  const toast = document.getElementById('toast');
  clearTimeout(_toastTimer);
  document.getElementById('toast-mensaje').textContent = mensaje;
  toast.classList.remove('oculto');
  _toastTimer = setTimeout(() => toast.classList.add('oculto'), duracion);
}


// =============================================================================
//  BEEP (WebAudio)
// =============================================================================

function reproducirBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.18);
  } catch (_) { /* ignorar si WebAudio no está disponible */ }
}


// =============================================================================
//  COMUNICACIÓN CON APPS SCRIPT
//
//  IMPORTANTE: Apps Script hace una redirección 302 en POST y el navegador
//  la convierte en GET, perdiendo el body. Por eso se usa siempre GET,
//  enviando todos los parámetros en la query string.
// =============================================================================

async function llamarAPI(params) {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  url.searchParams.set('_t', Date.now()); // romper caché del navegador

  const resp = await fetch(url.toString(), { redirect: 'follow', cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}


// =============================================================================
//  HELPERS COMUNES
// =============================================================================

/** Devuelve la primera letra en mayúscula de un nombre (para avatares). */
function inicialNombre(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase();
}

/** Genera el HTML de un ítem de lista de alumnas. */
function htmlAlumnaItem(a) {
  const clases = parseInt(a.clases_restantes) || 0;
  let badgeClase, badgeTexto;
  if (!a.activo) {
    badgeClase = 'alumna-badge-baja';
    badgeTexto = 'Baja';
  } else if (clases <= 1) {
    badgeClase = 'alumna-badge-aviso';
    badgeTexto  = `${clases} clase${clases !== 1 ? 's' : ''}`;
  } else {
    badgeClase = 'alumna-badge-ok';
    badgeTexto  = `${clases} clases`;
  }
  return `
    <li class="alumna-item" data-id="${a.id}" role="button" tabindex="0">
      <div class="alumna-avatar">${inicialNombre(a.nombre)}</div>
      <div class="alumna-info">
        <span class="alumna-nombre">${a.nombre}</span>
        <span class="alumna-sub">${a.pack} · ${a.telefono || ''}</span>
      </div>
      <span class="alumna-badge ${badgeClase}">${badgeTexto}</span>
    </li>`;
}

/** Añade event listeners a todos los ítems de una lista para abrir la ficha. */
function enlazarListaAFicha(contenedorId) {
  const ul = document.getElementById(contenedorId);
  ul.querySelectorAll('.alumna-item').forEach(item => {
    item.addEventListener('click', () => cargarFicha(item.dataset.id));
  });
}


// =============================================================================
//  PANTALLA 1 — HOME
// =============================================================================

function inicializarHome() {
  document.getElementById('btn-ir-escanear').addEventListener('click', () => {
    mostrarPantalla('pantalla-escanear');
  });
  document.getElementById('btn-ir-nueva-alumna').addEventListener('click', () => {
    mostrarPantalla('pantalla-nueva-alumna');
  });
  document.getElementById('btn-ir-dashboard').addEventListener('click', () => {
    mostrarPantalla('pantalla-dashboard');
    cargarDashboard();
  });
  document.getElementById('btn-ir-renovar').addEventListener('click', () => {
    mostrarPantalla('pantalla-renovar');
    cargarRenovar();
  });
  document.getElementById('btn-ir-alumnas').addEventListener('click', () => {
    mostrarPantalla('pantalla-alumnas');
    cargarAlumnas('activas');
  });
}


// =============================================================================
//  PANTALLA 2 — ESCANEAR QR
// =============================================================================

function iniciarScanner() {
  if (app.scannerActivo) return;
  if (!app.scanner) {
    try { app.scanner = new Html5Qrcode('lector-qr'); }
    catch (e) { mostrarToast('No se pudo inicializar el escáner.'); return; }
  }
  app.scanner
    .start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (texto) => manejarQrDetectado(texto),
      () => {}
    )
    .then(() => { app.scannerActivo = true; app.scanPausado = false; })
    .catch(() => mostrarToast('No se pudo acceder a la cámara. Comprueba los permisos.'));
}

function detenerScanner() {
  if (app.scanner && app.scannerActivo) {
    app.scanner.stop().catch(() => {});
    app.scannerActivo = false;
  }
}

async function manejarQrDetectado(texto) {
  if (app.scanPausado) return;
  app.scanPausado = true;
  reproducirBeep();
  detenerScanner();
  await procesarAsistencia(texto.trim());
}

async function procesarAsistencia(alumnoId) {
  mostrarSpinner();
  try {
    const datos = await llamarAPI({ accion: 'registrar_asistencia', alumno_id: alumnoId });
    mostrarPantalla('pantalla-resultado');
    mostrarResultadoEscaneo(datos, alumnoId);
  } catch (e) {
    mostrarToast('Error de conexión. Inténtalo de nuevo.');
    app.scanPausado = false;
  } finally {
    ocultarSpinner();
  }
}

function inicializarEscanear() {
  document.getElementById('btn-buscar-telefono').addEventListener('click', ejecutarBusquedaTelefono);
  document.getElementById('input-telefono-buscar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ejecutarBusquedaTelefono();
  });
}

async function ejecutarBusquedaTelefono() {
  const telefono = document.getElementById('input-telefono-buscar').value.trim();
  if (!telefono) { mostrarToast('Escribe un teléfono para buscar'); return; }

  mostrarSpinner();
  try {
    const datos  = await llamarAPI({ accion: 'buscar_por_telefono', telefono });
    const alumnas = datos.alumnas || [];

    if (alumnas.length === 0) {
      detenerScanner();
      mostrarPantalla('pantalla-resultado');
      mostrarResultadoEscaneo({ ok: false, motivo: 'no_existe' }, null);
    } else if (alumnas.length === 1) {
      detenerScanner();
      await procesarAsistencia(alumnas[0].id);
    } else {
      mostrarListaSeleccionTelefono(alumnas);
    }
  } catch (e) {
    mostrarToast('Error de conexión al buscar.');
  } finally {
    ocultarSpinner();
  }
}

function mostrarListaSeleccionTelefono(alumnas) {
  let c = document.getElementById('lista-seleccion-telefono');
  if (!c) {
    c = document.createElement('div');
    c.id = 'lista-seleccion-telefono';
    document.getElementById('pantalla-escanear').appendChild(c);
  }
  c.className = 'lista-seleccion-tel';
  c.innerHTML = `
    <p class="lista-sel-titulo">Varias alumnas coinciden. Toca la correcta:</p>
    <ul class="lista-alumnas">
      ${alumnas.map(a => `
        <li class="alumna-item" data-id="${a.id}" role="button" tabindex="0">
          <div class="alumna-avatar">${inicialNombre(a.nombre)}</div>
          <div class="alumna-info">
            <span class="alumna-nombre">${a.nombre}</span>
            <span class="alumna-sub">${a.telefono} · ${a.pack}</span>
          </div>
        </li>`).join('')}
    </ul>
    <button class="btn btn-fantasma btn-pequeno" id="btn-cerrar-seleccion">✕ Cancelar</button>`;
  c.classList.remove('oculto');

  c.querySelectorAll('.alumna-item').forEach(item => {
    item.addEventListener('click', async () => {
      c.classList.add('oculto');
      detenerScanner();
      await procesarAsistencia(item.dataset.id);
    });
  });
  document.getElementById('btn-cerrar-seleccion').addEventListener('click', () => {
    c.classList.add('oculto');
    document.getElementById('input-telefono-buscar').value = '';
  });
}


// =============================================================================
//  PANTALLA 2b — RESULTADO DE ESCANEO
// =============================================================================

const BLOQUES_RESULTADO = [
  'resultado-ok', 'resultado-problema',
  'resultado-no-existe', 'resultado-inactiva',
];

function mostrarResultadoEscaneo(datos, alumnoId) {
  app.alumnoIdActual = alumnoId;
  app.nombreActual   = datos.nombre || '';
  BLOQUES_RESULTADO.forEach(id => document.getElementById(id).classList.add('oculto'));

  // Nota de observaciones — visible si la alumna tiene notas
  const notaEl  = document.getElementById('resultado-obs-nota');
  const notaTxt = document.getElementById('resultado-obs-texto');
  if (notaEl && notaTxt) {
    if (datos.observaciones) {
      notaTxt.textContent = datos.observaciones;
      notaEl.classList.remove('oculto');
    } else {
      notaEl.classList.add('oculto');
    }
  }

  if (datos.ok) {
    _resultadoOk(datos);
  } else {
    switch (datos.motivo) {
      case 'sin_clases': _resultadoProblema(datos, 'sin_clases'); break;
      case 'caducado':   _resultadoProblema(datos, 'caducado');   break;
      case 'no_existe':  document.getElementById('resultado-no-existe').classList.remove('oculto'); break;
      case 'inactiva':   _resultadoInactiva(datos); break;
      default: mostrarToast(`Error: ${datos.motivo}`); volverAtras();
    }
  }
}

function _resultadoOk(d) {
  const n = d.clases_restantes;
  document.getElementById('resultado-ok-nombre').textContent = d.nombre;
  document.getElementById('resultado-ok-clases').innerHTML   = `Le quedan <strong>${n}</strong> clase${n !== 1 ? 's' : ''}`;
  document.getElementById('resultado-ok-pack').textContent   = `Pack ${d.pack}`;
  document.getElementById('resultado-ok').classList.remove('oculto');
}

function _resultadoProblema(d, motivo) {
  document.getElementById('resultado-prob-nombre').textContent = d.nombre;
  document.getElementById('resultado-prob-motivo').textContent =
    motivo === 'caducado' ? 'El pack de esta alumna ha caducado' : 'No le quedan clases disponibles';
  document.getElementById('resultado-prob-fechafin').textContent =
    d.fecha_fin ? `Válido hasta: ${d.fecha_fin}` : '';
  document.getElementById('renovar-inline').classList.add('oculto');
  document.getElementById('resultado-prob-acciones').classList.remove('oculto');
  document.querySelectorAll('input[name="pack-inline"]').forEach(r => r.checked = false);
  document.getElementById('resultado-problema').classList.remove('oculto');
}

function _resultadoInactiva(d) {
  document.getElementById('resultado-inactiva-nombre').textContent = d.nombre;
  document.getElementById('resultado-inactiva').classList.remove('oculto');
}

function inicializarResultado() {
  document.getElementById('btn-escanear-otra').addEventListener('click', _volverAEscanear);
  document.getElementById('btn-cancelar-problema').addEventListener('click', _volverAEscanear);
  document.getElementById('btn-volver-escanear-desde-resultado').addEventListener('click', _volverAEscanear);
  document.getElementById('btn-volver-escanear-inactiva').addEventListener('click', _volverAEscanear);

  document.getElementById('btn-mostrar-renovar-inline').addEventListener('click', () => {
    document.getElementById('resultado-prob-acciones').classList.add('oculto');
    document.getElementById('renovar-inline').classList.remove('oculto');
  });

  document.getElementById('btn-cancelar-renovar-inline').addEventListener('click', () => {
    document.getElementById('renovar-inline').classList.add('oculto');
    document.getElementById('resultado-prob-acciones').classList.remove('oculto');
  });

  document.getElementById('btn-confirmar-cambio-pack-inline').addEventListener('click', async () => {
    const pack = document.querySelector('input[name="pack-inline"]:checked')?.value;
    if (!pack) { mostrarToast('Selecciona un pack primero'); return; }
    if (!app.alumnoIdActual) return;
    mostrarSpinner();
    try {
      await llamarAPI({ accion: 'cambiar_pack', alumno_id: app.alumnoIdActual, nuevo_pack: pack });
      const d = await llamarAPI({ accion: 'registrar_asistencia', alumno_id: app.alumnoIdActual });
      mostrarResultadoEscaneo(d, app.alumnoIdActual);
    } catch (e) { mostrarToast('Error al cambiar pack. Inténtalo de nuevo.'); }
    finally { ocultarSpinner(); }
  });

  document.getElementById('btn-registrar-suelta-resultado').addEventListener('click', async () => {
    if (!app.alumnoIdActual) return;
    mostrarSpinner();
    try {
      await llamarAPI({ accion: 'registrar_suelta', alumno_id: app.alumnoIdActual });
      mostrarToast(`Suelta registrada para ${app.nombreActual}`);
      _volverAEscanear();
    } catch (e) { mostrarToast('Error al registrar suelta.'); }
    finally { ocultarSpinner(); }
  });

  document.getElementById('btn-crear-desde-resultado').addEventListener('click', () => {
    mostrarPantalla('pantalla-nueva-alumna');
  });
}

function _volverAEscanear() {
  document.getElementById('input-telefono-buscar').value = '';
  app.scanPausado = false;
  const prev = document.getElementById(app.pantallaActual);
  if (prev) prev.classList.add('oculta');
  app.pantallaActual = 'pantalla-escanear';
  app.historial = ['pantalla-home'];
  document.getElementById('pantalla-escanear').classList.remove('oculta');
  document.getElementById('btn-volver').classList.remove('oculto');
  iniciarScanner();
  window.scrollTo({ top: 0, behavior: 'instant' });
}


// =============================================================================
//  UTILIDADES QR — generación y descarga con qrcode.js (cliente)
// =============================================================================

function generarQR(texto) {
  const contenedor = document.getElementById('qr-contenedor');
  contenedor.innerHTML = '';
  new QRCode(contenedor, {
    text            : texto,
    width           : 280,
    height          : 280,
    colorDark       : '#3E2C1C',
    colorLight      : '#ffffff',
    correctLevel    : QRCode.CorrectLevel.H
  });
}

function descargarQR(alumnoId) {
  // qrcode.js pinta un <canvas> dentro del contenedor
  const canvas = document.querySelector('#qr-contenedor canvas');
  if (!canvas) { mostrarToast('No hay QR para descargar'); return; }
  const a = document.createElement('a');
  a.href     = canvas.toDataURL('image/png');
  a.download = `QR-${alumnoId}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// =============================================================================
//  PANTALLA 3 — NUEVA ALUMNA
// =============================================================================

function inicializarNuevaAlumna() {
  const form = document.getElementById('form-nueva-alumna');

  // Limpiar errores al escribir
  ['input-nombre', 'input-telefono'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById('error-' + id.replace('input-', '')).classList.add('oculto');
      document.getElementById(id).classList.remove('error');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre        = document.getElementById('input-nombre').value.trim();
    const telefono      = document.getElementById('input-telefono').value.trim();
    const pack          = document.querySelector('input[name="pack-nueva"]:checked')?.value || 'Esencial';
    const observaciones = document.getElementById('input-observaciones').value.trim();

    // Validación básica
    let valido = true;
    if (!nombre) {
      document.getElementById('error-nombre').classList.remove('oculto');
      document.getElementById('input-nombre').classList.add('error');
      valido = false;
    }
    if (!telefono) {
      document.getElementById('error-telefono').classList.remove('oculto');
      document.getElementById('input-telefono').classList.add('error');
      valido = false;
    }
    if (!valido) return;

    mostrarSpinner();
    try {
      const datos = await llamarAPI({ accion: 'alta_alumna', nombre, telefono, pack, observaciones });

      if (datos.ok) {
        // Guardar datos para la pantalla de QR
        app.nuevoNombre   = nombre;
        app.nuevoTelefono = telefono;
        app.nuevoId       = datos.alumno_id;

        // Mostrar pantalla de QR generado
        document.getElementById('qr-nombre-alumna').textContent = nombre;
        document.getElementById('qr-codigo-alumna').textContent = datos.alumno_id;
        form.reset();
        mostrarPantalla('pantalla-qr-generado');
        generarQR(datos.alumno_id);
      } else {
        mostrarToast(`Error: ${datos.detalle || datos.motivo}`);
      }
    } catch (e) {
      mostrarToast('Error de conexión. Inténtalo de nuevo.');
    } finally {
      ocultarSpinner();
    }
  });
}


// =============================================================================
//  PANTALLA 3b — QR GENERADO
// =============================================================================

function inicializarQrGenerado() {
  // Descargar QR como PNG directamente desde el canvas generado por qrcode.js
  document.getElementById('btn-descargar-qr').addEventListener('click', () => {
    descargarQR(app.nuevoId);
  });

  // Botón Hecho → volver al inicio
  document.getElementById('btn-hecho-qr').addEventListener('click', () => {
    mostrarPantalla('pantalla-home');
  });
}


// =============================================================================
//  PANTALLA 4 — DASHBOARD
// =============================================================================

async function cargarDashboard() {
  mostrarSpinner();
  try {
    const datos = await llamarAPI({ accion: 'dashboard' });
    if (!datos.ok) { mostrarToast('Error al cargar el dashboard.'); return; }

    app.dashboardDatos = datos;

    // Mes actual en texto
    const ahora = new Date();
    document.getElementById('dashboard-mes').textContent =
      ahora.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    // Estadísticas
    document.getElementById('stat-asistencias').textContent  = datos.asistencias_mes;
    document.getElementById('stat-altas').textContent        = datos.altas_mes;
    document.getElementById('stat-sueltas').textContent      = datos.sueltas_mes.cantidad;
    document.getElementById('stat-sueltas-euros').textContent = `${datos.sueltas_mes.euros} €`;

    // Badges de alertas
    document.getElementById('badge-avisar').textContent   = datos.avisar.length;
    document.getElementById('badge-caducado').textContent = datos.caducado.length;

  } catch (e) {
    mostrarToast('Error de conexión al cargar el dashboard.');
  } finally {
    ocultarSpinner();
  }
}

function inicializarDashboard() {
  ['btn-alerta-avisar', 'btn-alerta-caducado'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      const tipo = document.getElementById(id).dataset.tipo;
      mostrarPantalla('pantalla-lista-detalle');
      cargarListaDetalle(tipo);
    });
  });
}


// =============================================================================
//  PANTALLA 4b — LISTA DETALLADA (desde dashboard)
// =============================================================================

const TITULOS_DETALLE = {
  avisar   : '⚡ Pocas clases restantes',
  caducado : '⏰ Pack caducado',
};

function cargarListaDetalle(tipo) {
  if (!app.dashboardDatos) { volverAtras(); return; }

  const lista   = app.dashboardDatos[tipo] || [];
  const titulo  = TITULOS_DETALLE[tipo] || 'Alumnas';
  const ul      = document.getElementById('lista-detalle-items');

  document.getElementById('lista-detalle-titulo').textContent = titulo;

  if (lista.length === 0) {
    ul.innerHTML = `
      <li class="mensaje-vacio">
        <span class="mensaje-vacio-icono">✅</span>
        No hay alumnas en esta categoría
      </li>`;
    return;
  }

  // Los objetos del dashboard tienen id, nombre y (según tipo) clases_restantes o fecha_fin
  ul.innerHTML = lista.map(a => {
    const sub = a.clases_restantes !== undefined
      ? `${a.clases_restantes} clase${a.clases_restantes !== 1 ? 's' : ''} restante${a.clases_restantes !== 1 ? 's' : ''}`
      : (a.fecha_fin ? `Caducó: ${a.fecha_fin}` : '');
    return `
      <li class="alumna-item" data-id="${a.id}" role="button" tabindex="0">
        <div class="alumna-avatar">${inicialNombre(a.nombre)}</div>
        <div class="alumna-info">
          <span class="alumna-nombre">${a.nombre}</span>
          <span class="alumna-sub">${sub}</span>
        </div>
      </li>`;
  }).join('');

  enlazarListaAFicha('lista-detalle-items');
}


// =============================================================================
//  PANTALLA 5 — VER ALUMNAS
// =============================================================================

async function cargarAlumnas(filtro) {
  filtro = filtro || app.alumnasFiltroActivo;
  app.alumnasFiltroActivo = filtro;

  // Activar el tab correcto
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('tab-activo', t.dataset.filtro === filtro);
    t.setAttribute('aria-selected', t.dataset.filtro === filtro);
  });

  mostrarSpinner();
  try {
    const datos = await llamarAPI({ accion: 'listar_alumnas', filtro });
    app.alumnasCacheTotal = datos.alumnas || [];
    renderizarListaAlumnas(app.alumnasCacheTotal);
  } catch (e) {
    mostrarToast('Error al cargar las alumnas.');
  } finally {
    ocultarSpinner();
  }
}

function renderizarListaAlumnas(lista) {
  const ul = document.getElementById('lista-alumnas-items');
  if (lista.length === 0) {
    ul.innerHTML = `
      <li class="mensaje-vacio">
        <span class="mensaje-vacio-icono">🔍</span>
        No hay alumnas en esta categoría
      </li>`;
    return;
  }
  ul.innerHTML = lista.map(htmlAlumnaItem).join('');
  enlazarListaAFicha('lista-alumnas-items');
}

function inicializarAlumnas() {
  // Tabs de filtro
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.getElementById('input-buscar-alumna').value = '';
      cargarAlumnas(tab.dataset.filtro);
    });
  });

  // Buscador local (filtra sobre el caché ya cargado)
  document.getElementById('input-buscar-alumna').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      renderizarListaAlumnas(app.alumnasCacheTotal);
      return;
    }
    const filtradas = app.alumnasCacheTotal.filter(a =>
      a.nombre.toLowerCase().includes(q) ||
      String(a.telefono).toLowerCase().includes(q)
    );
    renderizarListaAlumnas(filtradas);
  });
}


// =============================================================================
//  PANTALLA 5b — FICHA DE ALUMNA
// =============================================================================

async function cargarFicha(alumnoId) {
  mostrarSpinner();
  try {
    const datos = await llamarAPI({ accion: 'ficha_alumna', alumno_id: alumnoId });
    if (!datos.ok) { mostrarToast('No se encontró la alumna.'); return; }

    const a = datos.alumna;
    app.fichaAlumnoId      = alumnoId;
    app.fichaActivo        = a.activo;
    app.fichaClasesBase    = parseInt(a.clases_restantes) || 0;
    app.fichaClasesDisplay = app.fichaClasesBase;

    // Avatar e identificación
    document.getElementById('ficha-avatar').textContent = inicialNombre(a.nombre);
    document.getElementById('ficha-nombre').textContent = a.nombre;
    document.getElementById('ficha-id').textContent     = a.id;

    // Badge activo/baja
    const badge = document.getElementById('ficha-badge-estado');
    badge.textContent = a.activo ? 'Activa' : 'Baja';
    badge.classList.toggle('baja', !a.activo);

    // Pack card
    document.getElementById('ficha-pack').textContent     = a.pack;
    document.getElementById('ficha-clases').textContent   = a.clases_restantes;
    document.getElementById('ficha-fecha-fin').textContent = a.fecha_fin;

    // Datos de contacto
    document.getElementById('ficha-telefono').textContent  = a.telefono;
    document.getElementById('ficha-fecha-alta').textContent = a.fecha_alta;
    // Observaciones (null-safe: estos elementos pueden no existir en versiones cacheadas)
    const elObsTxt    = document.getElementById('ficha-observaciones');
    const elObsInput  = document.getElementById('ficha-obs-input');
    const elObsVista  = document.getElementById('ficha-obs-vista');
    const elObsEditor = document.getElementById('ficha-obs-editor');
    if (elObsTxt)    elObsTxt.textContent  = a.observaciones || 'Sin notas';
    if (elObsInput)  elObsInput.value      = a.observaciones || '';
    if (elObsVista)  elObsVista.classList.remove('oculto');
    if (elObsEditor) elObsEditor.classList.add('oculto');

    // Ajuste de clases — restablecer display al valor actual
    document.getElementById('ajustar-valor-display').textContent = app.fichaClasesBase;

    // Botón baja / reactivar
    const btnBaja = document.getElementById('btn-ficha-baja-reactivar');
    if (a.activo) {
      btnBaja.textContent = '🚫 Dar de baja';
      btnBaja.classList.remove('btn-exito');
      btnBaja.classList.add('btn-baja');
    } else {
      btnBaja.textContent = '✅ Reactivar alumna';
      btnBaja.classList.remove('btn-baja');
      btnBaja.classList.add('btn-exito');
    }

    // Historial de asistencias
    const historialUl = document.getElementById('ficha-historial-lista');
    if (datos.ultimas_asistencias.length === 0) {
      historialUl.innerHTML = '<li class="mensaje-vacio">Sin asistencias registradas</li>';
    } else {
      historialUl.innerHTML = datos.ultimas_asistencias.map(as => `
        <li class="historial-item">
          <span class="historial-fecha">${as.fecha}</span>
          <span class="historial-estado historial-estado-${as.estado}">${as.estado}</span>
        </li>`).join('');
    }

    mostrarPantalla('pantalla-ficha');

  } catch (e) {
    mostrarToast('Error al cargar la ficha.');
  } finally {
    ocultarSpinner();
  }
}

function inicializarFicha() {
  // ── Ajuste de clases ──────────────────────────────────────────────────────
  document.getElementById('btn-restar-clase').addEventListener('click', () => {
    if (app.fichaClasesDisplay <= 0) return;
    app.fichaClasesDisplay--;
    document.getElementById('ajustar-valor-display').textContent = app.fichaClasesDisplay;
  });

  document.getElementById('btn-sumar-clase').addEventListener('click', () => {
    app.fichaClasesDisplay++;
    document.getElementById('ajustar-valor-display').textContent = app.fichaClasesDisplay;
  });

  document.getElementById('btn-guardar-ajuste').addEventListener('click', async () => {
    const delta = app.fichaClasesDisplay - app.fichaClasesBase;
    if (delta === 0) { mostrarToast('No hay cambios que guardar'); return; }
    mostrarSpinner();
    try {
      const datos = await llamarAPI({ accion: 'ajustar_clases', alumno_id: app.fichaAlumnoId, delta });
      if (datos.ok) {
        app.fichaClasesBase    = datos.clases_restantes;
        app.fichaClasesDisplay = datos.clases_restantes;
        document.getElementById('ficha-clases').textContent          = datos.clases_restantes;
        document.getElementById('ajustar-valor-display').textContent = datos.clases_restantes;
        mostrarToast('Clases actualizadas ✓');
      }
    } catch (e) {
      mostrarToast('Error al ajustar las clases.');
    } finally {
      ocultarSpinner();
    }
  });

  // ── Cambiar pack (abre modal) ─────────────────────────────────────────────
  document.getElementById('btn-ficha-cambiar-pack').addEventListener('click', () => {
    // Preseleccionar el pack actual
    const packActual = document.getElementById('ficha-pack').textContent;
    document.querySelectorAll('input[name="pack-cambio"]').forEach(r => {
      r.checked = r.value === packActual;
    });
    document.getElementById('modal-cambiar-pack').classList.remove('oculto');
  });

  document.getElementById('btn-cancelar-cambio-pack').addEventListener('click', () => {
    document.getElementById('modal-cambiar-pack').classList.add('oculto');
  });

  document.getElementById('btn-confirmar-cambio-pack-ficha').addEventListener('click', async () => {
    const pack = document.querySelector('input[name="pack-cambio"]:checked')?.value;
    if (!pack) { mostrarToast('Selecciona un pack'); return; }
    mostrarSpinner();
    try {
      const datos = await llamarAPI({ accion: 'cambiar_pack', alumno_id: app.fichaAlumnoId, nuevo_pack: pack });
      if (datos.ok) {
        document.getElementById('modal-cambiar-pack').classList.add('oculto');
        mostrarToast(`Pack cambiado a ${pack} ✓`);
        // Recargar la ficha para reflejar el cambio
        await cargarFicha(app.fichaAlumnoId);
      }
    } catch (e) {
      mostrarToast('Error al cambiar el pack.');
    } finally {
      ocultarSpinner();
    }
  });

  // Cerrar modal al pulsar fuera
  document.getElementById('modal-cambiar-pack').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('modal-cambiar-pack').classList.add('oculto');
    }
  });

  // ── Ver QR ───────────────────────────────────────────────────────────────
  document.getElementById('btn-ficha-ver-qr').addEventListener('click', () => {
    const nombre = document.getElementById('ficha-nombre').textContent;
    // Reutilizar la pantalla de QR generado en modo "solo visualización"
    app.nuevoNombre   = nombre;
    app.nuevoTelefono = document.getElementById('ficha-telefono').textContent;
    app.nuevoId       = app.fichaAlumnoId;
    document.getElementById('qr-nombre-alumna').textContent = nombre;
    document.getElementById('qr-codigo-alumna').textContent = app.fichaAlumnoId;
    mostrarPantalla('pantalla-qr-generado');
    generarQR(app.fichaAlumnoId);
  });

  // ── Dar de baja / Reactivar ───────────────────────────────────────────────
  document.getElementById('btn-ficha-baja-reactivar').addEventListener('click', () => {
    if (app.fichaActivo) {
      // Dar de baja → pedir confirmación en modal
      const nombre = document.getElementById('ficha-nombre').textContent;
      document.getElementById('modal-baja-nombre').innerHTML =
        `Se marcará a <strong>${nombre}</strong> como inactiva. Podrás reactivarla cuando quieras.`;
      document.getElementById('modal-baja').classList.remove('oculto');
    } else {
      // Reactivar directamente (no destructivo)
      _reactivarAlumna();
    }
  });

  document.getElementById('btn-cancelar-baja').addEventListener('click', () => {
    document.getElementById('modal-baja').classList.add('oculto');
  });

  document.getElementById('btn-confirmar-baja').addEventListener('click', async () => {
    document.getElementById('modal-baja').classList.add('oculto');
    mostrarSpinner();
    try {
      await llamarAPI({ accion: 'dar_baja', alumno_id: app.fichaAlumnoId });
      mostrarToast('Alumna dada de baja');
      volverAtras();
    } catch (e) {
      mostrarToast('Error al dar de baja.');
    } finally {
      ocultarSpinner();
    }
  });

  document.getElementById('modal-baja').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('modal-baja').classList.add('oculto');
  });

  // ── Editar observaciones (null-safe: solo se conecta si los elementos existen) ──
  const btnEditarObs   = document.getElementById('btn-editar-obs');
  const btnCancelarObs = document.getElementById('btn-cancelar-obs');
  const btnGuardarObs  = document.getElementById('btn-guardar-obs');

  if (btnEditarObs) {
    btnEditarObs.addEventListener('click', () => {
      document.getElementById('ficha-obs-vista').classList.add('oculto');
      document.getElementById('ficha-obs-editor').classList.remove('oculto');
      document.getElementById('ficha-obs-input').focus();
    });
  }

  if (btnCancelarObs) {
    btnCancelarObs.addEventListener('click', () => {
      document.getElementById('ficha-obs-editor').classList.add('oculto');
      document.getElementById('ficha-obs-vista').classList.remove('oculto');
    });
  }

  if (btnGuardarObs) {
    btnGuardarObs.addEventListener('click', async () => {
      const texto = document.getElementById('ficha-obs-input').value.trim();
      mostrarSpinner();
      try {
        await llamarAPI({ accion: 'editar_observacion', alumno_id: app.fichaAlumnoId, observacion: texto });
        document.getElementById('ficha-observaciones').textContent = texto || 'Sin notas';
        document.getElementById('ficha-obs-editor').classList.add('oculto');
        document.getElementById('ficha-obs-vista').classList.remove('oculto');
        mostrarToast('Notas guardadas ✓');
      } catch (e) {
        mostrarToast('Error al guardar las notas.');
      } finally {
        ocultarSpinner();
      }
    });
  }
}

async function _reactivarAlumna() {
  mostrarSpinner();
  try {
    await llamarAPI({ accion: 'reactivar', alumno_id: app.fichaAlumnoId });
    mostrarToast('Alumna reactivada ✓');
    await cargarFicha(app.fichaAlumnoId); // recargar para actualizar el badge
  } catch (e) {
    mostrarToast('Error al reactivar.');
  } finally {
    ocultarSpinner();
  }
}


// =============================================================================
//  PANTALLA 6 — RENOVAR MES
// =============================================================================

async function cargarRenovar() {
  mostrarSpinner();
  try {
    const datos = await llamarAPI({ accion: 'listar_alumnas', filtro: 'activas' });
    const alumnas = datos.alumnas || [];
    const ul = document.getElementById('renovar-lista');

    if (alumnas.length === 0) {
      ul.innerHTML = `<li class="mensaje-vacio"><span class="mensaje-vacio-icono">🧘</span>No hay alumnas activas</li>`;
      actualizarResumenRenovar();
      return;
    }

    ul.innerHTML = alumnas.map(a => `
      <li class="renovar-item">
        <label class="renovar-check">
          <input type="checkbox" data-alumno-id="${a.id}" checked />
          <div class="renovar-info">
            <span class="renovar-nombre">${a.nombre}</span>
            <span class="renovar-pack-actual">${a.pack} · ${a.clases_restantes} clase${a.clases_restantes !== 1 ? 's' : ''}</span>
          </div>
        </label>
        <select class="renovar-pack-select" aria-label="Pack para ${a.nombre}">
          <option value="Esencial" ${a.pack === 'Esencial' ? 'selected' : ''}>Esencial</option>
          <option value="Habito"   ${a.pack === 'Habito'   ? 'selected' : ''}>Hábito</option>
          <option value="Estilo"   ${a.pack === 'Estilo'   ? 'selected' : ''}>Estilo</option>
          <option value="Suelta"   ${a.pack === 'Suelta'   ? 'selected' : ''}>Suelta</option>
        </select>
      </li>`).join('');

    // Actualizar contador al cambiar checkboxes
    ul.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', actualizarResumenRenovar);
    });

    actualizarResumenRenovar();

  } catch (e) {
    mostrarToast('Error al cargar la lista de renovación.');
  } finally {
    ocultarSpinner();
  }
}

function actualizarResumenRenovar() {
  const checks = document.querySelectorAll('#renovar-lista input[type="checkbox"]');
  const marcadas = Array.from(checks).filter(c => c.checked).length;
  document.getElementById('renovar-resumen').textContent =
    `${marcadas} alumna${marcadas !== 1 ? 's' : ''} seleccionada${marcadas !== 1 ? 's' : ''}`;
}

function inicializarRenovar() {
  document.getElementById('btn-marcar-todas').addEventListener('click', () => {
    document.querySelectorAll('#renovar-lista input[type="checkbox"]').forEach(c => c.checked = true);
    actualizarResumenRenovar();
  });

  document.getElementById('btn-desmarcar-todas').addEventListener('click', () => {
    document.querySelectorAll('#renovar-lista input[type="checkbox"]').forEach(c => c.checked = false);
    actualizarResumenRenovar();
  });

  document.getElementById('btn-confirmar-renovacion').addEventListener('click', async () => {
    const items = document.querySelectorAll('#renovar-lista .renovar-item');
    if (items.length === 0) { mostrarToast('No hay alumnas para renovar'); return; }

    const renovaciones = Array.from(items).map(item => {
      const cb  = item.querySelector('input[type="checkbox"]');
      const sel = item.querySelector('.renovar-pack-select');
      return {
        alumno_id  : cb.dataset.alumnoId,
        nuevo_pack : cb.checked ? sel.value : null,
      };
    });

    mostrarSpinner();
    try {
      const datos = await llamarAPI({
        accion      : 'renovar_mes',
        renovaciones: JSON.stringify(renovaciones),
      });

      if (datos.ok) {
        const msg = `Renovadas: ${datos.renovadas}`;
        mostrarToast(msg, 4000);
        mostrarPantalla('pantalla-home');
      } else {
        mostrarToast(`Error al renovar: ${datos.motivo}`);
      }
    } catch (e) {
      mostrarToast('Error de conexión al renovar.');
    } finally {
      ocultarSpinner();
    }
  });
}


// =============================================================================
//  INICIALIZACIÓN GLOBAL
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-volver').addEventListener('click', volverAtras);

  inicializarHome();
  inicializarEscanear();
  inicializarResultado();
  inicializarNuevaAlumna();
  inicializarQrGenerado();
  inicializarDashboard();
  inicializarAlumnas();
  inicializarFicha();
  inicializarRenovar();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
});

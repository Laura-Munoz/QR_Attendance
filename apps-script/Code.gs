// =============================================================================
// Code.gs — Backend para la PWA "Vida de Yoguis"
// =============================================================================
// Desplegar en Google Apps Script como:
//   · Ejecutar como: Yo (cuenta propietaria del Sheet)
//   · Acceso:        Cualquier persona (incluso anónimos)
//
// Todos los endpoints se enrutan por el parámetro "accion".
// Tanto doGet como doPost comparten el mismo enrutador.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTES GLOBALES
// ─────────────────────────────────────────────────────────────────────────────

/** Nombres de las hojas del Spreadsheet (deben coincidir exactamente). */
var HOJA_CLIENTES    = 'Clientes';
var HOJA_ASISTENCIAS = 'Asistencias';
var HOJA_CONFIG      = 'Config';

/**
 * Índices de columnas (base 1, para usarlos directamente con getRange).
 * Se definen como objeto para que el código sea legible y fácil de mantener.
 */
var COL_C = {
  ID             : 1,
  NOMBRE         : 2,
  TELEFONO       : 3,
  PACK           : 4,
  CLASES_REST    : 5,
  TIENE_RECUP    : 6,
  FECHA_INICIO   : 7,
  FECHA_FIN      : 8,
  ACTIVO         : 9,
  OBSERVACIONES  : 10,
  FECHA_ALTA     : 11
};

var COL_A = {
  TIMESTAMP  : 1,
  ALUMNO_ID  : 2,
  NOMBRE     : 3,
  ESTADO     : 4
};

/** Valores posibles de pack. */
var PACKS_VALIDOS = ['Suelta', 'Esencial', 'Habito', 'Estilo'];


// ─────────────────────────────────────────────────────────────────────────────
//  ENRUTADORES PRINCIPALES
// ─────────────────────────────────────────────────────────────────────────────

/** Punto de entrada para peticiones GET. */
function doGet(e) {
  return enrutar(e);
}

/** Punto de entrada para peticiones POST. */
function doPost(e) {
  return enrutar(e);
}

/**
 * Enrutador central: lee el parámetro "accion" y delega al endpoint correcto.
 * Soporta parámetros en query string, en body urlencoded y en body JSON.
 */
function enrutar(e) {
  var resultado;

  try {
    // Parámetros de query string o body urlencoded
    var params = e.parameter ? copiarObjeto(e.parameter) : {};

    // Si viene body JSON (Content-Type: application/json), se fusiona con params
    if (e.postData && e.postData.type === 'application/json' && e.postData.contents) {
      try {
        var bodyJson = JSON.parse(e.postData.contents);
        Object.keys(bodyJson).forEach(function (k) { params[k] = bodyJson[k]; });
      } catch (ex) {
        // Cuerpo no era JSON válido; se ignora y se usan los params normales
      }
    }

    // Si se envía un campo "payload" con JSON (alternativa para enviar arrays)
    if (params.payload) {
      try {
        var extra = JSON.parse(params.payload);
        Object.keys(extra).forEach(function (k) { params[k] = extra[k]; });
      } catch (ex) { /* ignorar si no es JSON válido */ }
    }

    var accion = params.accion || '';

    switch (accion) {
      case 'alta_alumna':           resultado = altaAlumna(params);           break;
      case 'registrar_asistencia':  resultado = registrarAsistencia(params);  break;
      case 'registrar_suelta':      resultado = registrarSuelta(params);      break;
      case 'cambiar_pack':          resultado = cambiarPack(params);          break;
      case 'ajustar_clases':        resultado = ajustarClases(params);        break;
      case 'listar_alumnas':        resultado = listarAlumnas(params);        break;
      case 'ficha_alumna':          resultado = fichaAlumna(params);          break;
      case 'dashboard':             resultado = dashboard(params);            break;
      case 'renovar_mes':           resultado = renovarMes(params);           break;
      case 'dar_baja':              resultado = darBaja(params);              break;
      case 'reactivar':             resultado = reactivar(params);            break;
      case 'regenerar_qr':          resultado = regenerarQr(params);          break;
      case 'buscar_por_telefono':   resultado = buscarPorTelefono(params);    break;
      case 'editar_observacion':    resultado = editarObservacion(params);    break;
      default:
        resultado = { ok: false, motivo: 'accion_desconocida', accion: accion };
    }

  } catch (err) {
    resultado = { ok: false, motivo: 'error_servidor', detalle: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 1 — alta_alumna
//  POST: nombre, telefono, pack, observaciones
//  Devuelve: { ok, alumno_id, qr_url }
// ─────────────────────────────────────────────────────────────────────────────

function altaAlumna(params) {
  var nombre        = trim(params.nombre        || '');
  var telefono      = trim(params.telefono      || '');
  var pack          = trim(params.pack          || 'Esencial');
  var observaciones = trim(params.observaciones || '');

  if (!nombre || !telefono) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'nombre y telefono son obligatorios' };
  }
  if (!esPackValido(pack)) {
    return { ok: false, motivo: 'pack_invalido', detalle: 'Valores permitidos: Suelta, Esencial, Habito, Estilo' };
  }

  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var hoja     = ss.getSheetByName(HOJA_CLIENTES);
  var nuevoId  = generarSiguienteId(hoja);
  var hoy      = new Date();
  var fechaFin = ultimoDiaMes(hoy);
  var clases   = clasesParaPack(pack);

  hoja.appendRow([
    nuevoId,
    nombre,
    telefono,
    pack,
    clases,
    false,                      // tiene_recuperacion: siempre FALSE (regla eliminada)
    formatearFecha(hoy),        // fecha_inicio: hoy
    formatearFecha(fechaFin),   // fecha_fin: último día del mes en curso
    true,                       // activo
    observaciones,
    formatearFecha(hoy)         // fecha_alta
  ]);

  return { ok: true, alumno_id: nuevoId, qr_url: generarQrUrl(nuevoId) };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 2 — registrar_asistencia
//  GET/POST: alumno_id
//
//  Registra la asistencia de la alumna: descuenta 1 clase y anota en Asistencias.
//  Las clases no gastadas en el mes anterior no se recuperan: al renovar se resetea a cero.
// ─────────────────────────────────────────────────────────────────────────────

function registrarAsistencia(params) {
  var alumnoId = trim(params.alumno_id || '');

  if (!alumnoId) {
    return { ok: false, motivo: 'no_existe' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var fila = buscarFilaAlumna(hoja, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  var datos         = hoja.getRange(fila, 1, 1, 11).getValues()[0];
  var nombre        = datos[COL_C.NOMBRE        - 1];
  var pack          = datos[COL_C.PACK          - 1];
  var clases        = parseInt(datos[COL_C.CLASES_REST - 1]) || 0;
  var fechaFinRaw   = datos[COL_C.FECHA_FIN     - 1];
  var activo        = datos[COL_C.ACTIVO        - 1] === true;
  var observaciones = trim(String(datos[COL_C.OBSERVACIONES - 1] || ''));

  if (!activo) {
    return { ok: false, motivo: 'inactiva', nombre: nombre, observaciones: observaciones };
  }

  var fechaFinStr = formatearFecha(fechaFinRaw);

  if (esFechaVencida(fechaFinRaw)) {
    return { ok: false, motivo: 'caducado', nombre: nombre, fecha_fin: fechaFinStr, observaciones: observaciones };
  }

  if (clases <= 0) {
    return { ok: false, motivo: 'sin_clases', nombre: nombre, pack: pack, fecha_fin: fechaFinStr, observaciones: observaciones };
  }

  var clasesRestantes = clases - 1;
  hoja.getRange(fila, COL_C.CLASES_REST).setValue(clasesRestantes);
  insertarAsistencia(ss, alumnoId, nombre, 'asistio');

  return {
    ok               : true,
    estado           : 'asistio',
    nombre           : nombre,
    pack             : pack,
    clases_restantes : clasesRestantes,
    observaciones    : observaciones
  };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 3 — registrar_suelta
//  POST: alumno_id  (si existe)  O  nombre + telefono  (si es nueva)
//  Devuelve: { ok, estado: "suelta", nombre, alumno_id }
// ─────────────────────────────────────────────────────────────────────────────

function registrarSuelta(params) {
  var alumnoId = trim(params.alumno_id || '');
  var nombre   = trim(params.nombre   || '');
  var telefono = trim(params.telefono || '');

  var ss             = SpreadsheetApp.getActiveSpreadsheet();
  var hojaClientes   = ss.getSheetByName(HOJA_CLIENTES);

  if (alumnoId) {
    // Alumna identificada por ID
    var fila = buscarFilaAlumna(hojaClientes, alumnoId);
    if (!fila) {
      return { ok: false, motivo: 'no_existe' };
    }
    // Leer el nombre actualizado desde el sheet
    nombre = hojaClientes.getRange(fila, COL_C.NOMBRE).getValue();

  } else if (nombre && telefono) {
    // Alumna nueva: se da de alta al vuelo con pack Suelta y 0 clases
    var nuevoId  = generarSiguienteId(hojaClientes);
    var hoy      = new Date();
    var fechaFin = ultimoDiaMes(hoy);

    hojaClientes.appendRow([
      nuevoId, nombre, telefono, 'Suelta',
      0, false,
      formatearFecha(hoy), formatearFecha(fechaFin),
      true, '', formatearFecha(hoy)
    ]);
    alumnoId = nuevoId;

  } else {
    return {
      ok      : false,
      motivo  : 'faltan_datos',
      detalle : 'Envía alumno_id o bien nombre+telefono para crear una alumna al vuelo'
    };
  }

  insertarAsistencia(ss, alumnoId, nombre, 'suelta');
  return { ok: true, estado: 'suelta', nombre: nombre, alumno_id: alumnoId };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 4 — cambiar_pack
//  POST: alumno_id, nuevo_pack
//  Devuelve: { ok, clases_restantes, fecha_fin }
// ─────────────────────────────────────────────────────────────────────────────

function cambiarPack(params) {
  var alumnoId  = trim(params.alumno_id  || '');
  var nuevoPack = trim(params.nuevo_pack || '');

  if (!alumnoId || !nuevoPack) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'alumno_id y nuevo_pack son obligatorios' };
  }
  if (!esPackValido(nuevoPack)) {
    return { ok: false, motivo: 'pack_invalido' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var fila = buscarFilaAlumna(hoja, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  var clases       = clasesParaPack(nuevoPack);
  var fechaFinStr  = formatearFecha(ultimoDiaMes(new Date()));

  hoja.getRange(fila, COL_C.PACK).setValue(nuevoPack);
  hoja.getRange(fila, COL_C.CLASES_REST).setValue(clases);
  hoja.getRange(fila, COL_C.FECHA_FIN).setValue(fechaFinStr);

  return { ok: true, clases_restantes: clases, fecha_fin: fechaFinStr };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 5 — ajustar_clases
//  POST: alumno_id, delta (entero positivo o negativo)
//  Devuelve: { ok, clases_restantes }
// ─────────────────────────────────────────────────────────────────────────────

function ajustarClases(params) {
  var alumnoId = trim(params.alumno_id || '');
  var delta    = parseInt(params.delta) || 0;

  if (!alumnoId) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'alumno_id es obligatorio' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var fila = buscarFilaAlumna(hoja, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  var clasesActuales = parseInt(hoja.getRange(fila, COL_C.CLASES_REST).getValue()) || 0;
  var nuevasClases   = Math.max(0, clasesActuales + delta); // nunca baja de 0

  hoja.getRange(fila, COL_C.CLASES_REST).setValue(nuevasClases);
  return { ok: true, clases_restantes: nuevasClases };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 6 — listar_alumnas
//  GET: filtro (todas | activas | baja)
//  Devuelve: { ok, alumnas: [{id, nombre, pack, clases_restantes, telefono, activo}] }
// ─────────────────────────────────────────────────────────────────────────────

function listarAlumnas(params) {
  var filtro = trim(params.filtro || 'activas');

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var data = hoja.getDataRange().getValues();

  var alumnas = [];

  // Índice 0 = fila de encabezados, se salta
  for (var i = 1; i < data.length; i++) {
    var fila   = data[i];
    var activo = fila[COL_C.ACTIVO - 1] === true;

    if (filtro === 'activas' && !activo) continue;
    if (filtro === 'baja'    &&  activo) continue;

    alumnas.push({
      id               : fila[COL_C.ID          - 1],
      nombre           : fila[COL_C.NOMBRE       - 1],
      pack             : fila[COL_C.PACK         - 1],
      clases_restantes : fila[COL_C.CLASES_REST  - 1],
      telefono         : fila[COL_C.TELEFONO     - 1],
      activo           : activo
    });
  }

  return { ok: true, alumnas: alumnas };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 7 — ficha_alumna
//  GET: alumno_id
//  Devuelve: { ok, alumna: {...}, ultimas_asistencias: [{fecha, estado}] }
// ─────────────────────────────────────────────────────────────────────────────

function fichaAlumna(params) {
  var alumnoId = trim(params.alumno_id || '');

  if (!alumnoId) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'alumno_id es obligatorio' };
  }

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var hojaC = ss.getSheetByName(HOJA_CLIENTES);
  var hojaA = ss.getSheetByName(HOJA_ASISTENCIAS);
  var fila  = buscarFilaAlumna(hojaC, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  var datos = hojaC.getRange(fila, 1, 1, 11).getValues()[0];

  var alumna = {
    id                : datos[COL_C.ID           - 1],
    nombre            : datos[COL_C.NOMBRE        - 1],
    telefono          : datos[COL_C.TELEFONO      - 1],
    pack              : datos[COL_C.PACK          - 1],
    clases_restantes  : datos[COL_C.CLASES_REST   - 1],
    tiene_recuperacion: datos[COL_C.TIENE_RECUP   - 1] === true,
    fecha_inicio      : formatearFecha(datos[COL_C.FECHA_INICIO  - 1]),
    fecha_fin         : formatearFecha(datos[COL_C.FECHA_FIN     - 1]),
    activo            : datos[COL_C.ACTIVO        - 1] === true,
    observaciones     : datos[COL_C.OBSERVACIONES - 1],
    fecha_alta        : formatearFecha(datos[COL_C.FECHA_ALTA    - 1]),
    qr_url            : generarQrUrl(datos[COL_C.ID - 1])
  };

  // Últimas 10 asistencias (recorremos el historial de atrás hacia adelante)
  var dataA       = hojaA.getDataRange().getValues();
  var asistencias = [];

  for (var i = dataA.length - 1; i >= 1 && asistencias.length < 10; i--) {
    var row = dataA[i];
    if (String(row[COL_A.ALUMNO_ID - 1]) === String(alumnoId)) {
      asistencias.push({
        fecha  : formatearFechaHora(row[COL_A.TIMESTAMP - 1]),
        estado : row[COL_A.ESTADO - 1]
      });
    }
  }

  return { ok: true, alumna: alumna, ultimas_asistencias: asistencias };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 8 — dashboard
//  GET: (sin parámetros)
//  Devuelve: estadísticas del mes actual y listas de alertas
// ─────────────────────────────────────────────────────────────────────────────

function dashboard() {
  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var hojaC      = ss.getSheetByName(HOJA_CLIENTES);
  var hojaA      = ss.getSheetByName(HOJA_ASISTENCIAS);
  var hoy        = new Date();
  var mesActual  = hoy.getMonth();
  var anioActual = hoy.getFullYear();

  // ── Contadores de asistencias del mes ──────────────────────────────────────
  var dataA          = hojaA.getDataRange().getValues();
  var asistenciasMes = 0;
  var sueltasMes     = 0;

  for (var i = 1; i < dataA.length; i++) {
    var ts     = new Date(dataA[i][COL_A.TIMESTAMP - 1]);
    var estado = String(dataA[i][COL_A.ESTADO - 1]);

    if (ts.getMonth() === mesActual && ts.getFullYear() === anioActual) {
      if (estado === 'asistio') asistenciasMes++;
      if (estado === 'suelta')  sueltasMes++;
    }
  }

  var precioSuelta = parseInt(obtenerConfig('precio_suelta')) || 10;

  // ── Análisis de alumnas activas ────────────────────────────────────────────
  var dataC                = hojaC.getDataRange().getValues();
  var altasMes = 0;
  var avisar   = []; // ≤ 1 clase restante
  var caducado = []; // fecha_fin vencida

  for (var j = 1; j < dataC.length; j++) {
    var fila   = dataC[j];
    var activo = fila[COL_C.ACTIVO - 1] === true;
    if (!activo) continue;

    var fechaAltaRaw = fila[COL_C.FECHA_ALTA   - 1];
    var fechaFinRaw  = fila[COL_C.FECHA_FIN    - 1];
    var clases       = parseInt(fila[COL_C.CLASES_REST  - 1]) || 0;
    var id           = fila[COL_C.ID   - 1];
    var nombre       = fila[COL_C.NOMBRE - 1];
    var fechaFinStr  = formatearFecha(fechaFinRaw);

    // Altas dadas en el mes actual
    var fechaAlta = new Date(fechaAltaRaw);
    if (fechaAlta.getMonth() === mesActual && fechaAlta.getFullYear() === anioActual) {
      altasMes++;
    }

    // Alertas de clases bajas (1 o menos, pero el pack no está caducado)
    if (clases <= 1 && !esFechaVencida(fechaFinRaw)) {
      avisar.push({ id: id, nombre: nombre, clases_restantes: clases });
    }

    // Pack caducado
    if (esFechaVencida(fechaFinRaw)) {
      caducado.push({ id: id, nombre: nombre, fecha_fin: fechaFinStr });
    }
  }

  return {
    ok              : true,
    asistencias_mes : asistenciasMes,
    sueltas_mes     : { cantidad: sueltasMes, euros: sueltasMes * precioSuelta },
    altas_mes       : altasMes,
    avisar          : avisar,
    caducado        : caducado
  };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 9 — renovar_mes
//  POST: renovaciones (JSON string con array [{alumno_id, nuevo_pack | null}])
//  Devuelve: { ok, renovadas }
// ─────────────────────────────────────────────────────────────────────────────

function renovarMes(params) {
  // El frontend envía "renovaciones" como JSON string (array de objetos)
  var renovacionesRaw = params.renovaciones || '[]';
  var renovaciones;

  try {
    renovaciones = typeof renovacionesRaw === 'string'
      ? JSON.parse(renovacionesRaw)
      : renovacionesRaw;
  } catch (ex) {
    return { ok: false, motivo: 'json_invalido', detalle: 'El campo renovaciones debe ser un array JSON' };
  }

  if (!Array.isArray(renovaciones)) {
    return { ok: false, motivo: 'formato_invalido', detalle: 'renovaciones debe ser un array' };
  }

  var ss            = SpreadsheetApp.getActiveSpreadsheet();
  var hoja          = ss.getSheetByName(HOJA_CLIENTES);
  var renovadas     = 0;
  var nuevaFechaFin = formatearFecha(ultimoDiaMes(new Date()));
  var fechaHoy              = formatearFecha(new Date());

  renovaciones.forEach(function (item) {
    var alumnoId  = trim(item.alumno_id  || '');
    var nuevoPack = item.nuevo_pack !== undefined ? item.nuevo_pack : null;

    if (!alumnoId) return;

    var fila = buscarFilaAlumna(hoja, alumnoId);
    if (!fila) return;

    if (nuevoPack === null) {
      // Sin pack asignado → dar de baja
      hoja.getRange(fila, COL_C.ACTIVO).setValue(false);

    } else {
      // Las clases no gastadas del mes anterior se pierden: se resetea al valor del pack
      var nuevasClases = clasesParaPack(nuevoPack);

      hoja.getRange(fila, COL_C.PACK).setValue(nuevoPack);
      hoja.getRange(fila, COL_C.CLASES_REST).setValue(nuevasClases);
      hoja.getRange(fila, COL_C.TIENE_RECUP).setValue(false);
      hoja.getRange(fila, COL_C.FECHA_INICIO).setValue(fechaHoy);
      hoja.getRange(fila, COL_C.FECHA_FIN).setValue(nuevaFechaFin);
      renovadas++;
    }
  });

  return {
    ok        : true,
    renovadas : renovadas
  };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 10 — dar_baja
//  POST: alumno_id
//  Devuelve: { ok }
// ─────────────────────────────────────────────────────────────────────────────

function darBaja(params) {
  var alumnoId = trim(params.alumno_id || '');

  if (!alumnoId) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'alumno_id es obligatorio' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var fila = buscarFilaAlumna(hoja, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  var nombre = hoja.getRange(fila, COL_C.NOMBRE).getValue();
  hoja.getRange(fila, COL_C.ACTIVO).setValue(false);

  // Registrar la baja en el historial de asistencias para trazabilidad
  insertarAsistencia(ss, alumnoId, nombre, 'baja');

  return { ok: true };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 11 — reactivar
//  POST: alumno_id
//  Devuelve: { ok }
// ─────────────────────────────────────────────────────────────────────────────

function reactivar(params) {
  var alumnoId = trim(params.alumno_id || '');

  if (!alumnoId) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'alumno_id es obligatorio' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var fila = buscarFilaAlumna(hoja, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  hoja.getRange(fila, COL_C.ACTIVO).setValue(true);
  return { ok: true };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 12 — regenerar_qr
//  GET: alumno_id
//  Devuelve: { ok, qr_url }
// ─────────────────────────────────────────────────────────────────────────────

function regenerarQr(params) {
  var alumnoId = trim(params.alumno_id || '');

  if (!alumnoId) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'alumno_id es obligatorio' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var fila = buscarFilaAlumna(hoja, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  // El QR es determinista: mismo id → misma URL. No hay nada que "regenerar"
  // en el servidor; simplemente se devuelve la URL correcta.
  return { ok: true, qr_url: generarQrUrl(alumnoId) };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 13 — buscar_por_telefono
//  GET: telefono (puede ser parcial, busca por substring)
//  Devuelve: { ok, alumnas: [{id, nombre, telefono, pack, clases_restantes}] }
// ─────────────────────────────────────────────────────────────────────────────

function buscarPorTelefono(params) {
  var telefono = trim(params.telefono || '');

  if (!telefono) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'telefono es obligatorio' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var data = hoja.getDataRange().getValues();
  var alumnas = [];

  for (var i = 1; i < data.length; i++) {
    var fila    = data[i];
    var telFila = String(fila[COL_C.TELEFONO - 1]);

    // Búsqueda por substring (el teléfono buscado puede ser parcial)
    if (telFila.indexOf(telefono) !== -1) {
      alumnas.push({
        id               : fila[COL_C.ID          - 1],
        nombre           : fila[COL_C.NOMBRE       - 1],
        telefono         : telFila,
        pack             : fila[COL_C.PACK         - 1],
        clases_restantes : fila[COL_C.CLASES_REST  - 1]
      });
    }
  }

  return { ok: true, alumnas: alumnas };
}


// ─────────────────────────────────────────────────────────────────────────────
//  ENDPOINT 14 — editar_observacion
//  GET/POST: alumno_id, observacion
//  Devuelve: { ok }
// ─────────────────────────────────────────────────────────────────────────────

function editarObservacion(params) {
  var alumnoId     = trim(params.alumno_id    || '');
  var observacion  = trim(params.observacion  || '');

  if (!alumnoId) {
    return { ok: false, motivo: 'faltan_datos', detalle: 'alumno_id es obligatorio' };
  }

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CLIENTES);
  var fila = buscarFilaAlumna(hoja, alumnoId);

  if (!fila) {
    return { ok: false, motivo: 'no_existe' };
  }

  hoja.getRange(fila, COL_C.OBSERVACIONES).setValue(observacion);
  return { ok: true, observaciones: observacion };
}


// =============================================================================
//  FUNCIONES AUXILIARES
// =============================================================================

/**
 * Busca la fila (base 1) de una alumna en la hoja Clientes por su ID.
 * Devuelve null si no se encuentra.
 */
function buscarFilaAlumna(hoja, alumnoId) {
  var data = hoja.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL_C.ID - 1]) === String(alumnoId)) {
      return i + 1; // getValues usa base 0; getRange usa base 1
    }
  }
  return null;
}

/**
 * Genera el siguiente ID correlativo (A001, A002…).
 * Lee el último ID de la hoja y suma 1.
 */
function generarSiguienteId(hoja) {
  var lastRow = hoja.getLastRow();

  // Si la hoja solo tiene el encabezado (fila 1) o está vacía
  if (lastRow <= 1) return 'A001';

  var lastId  = String(hoja.getRange(lastRow, COL_C.ID).getValue());
  var numero  = parseInt(lastId.replace(/\D/g, ''), 10) || 0;
  return 'A' + String(numero + 1).padStart(3, '0');
}

/**
 * Devuelve el número de clases correspondiente a un pack,
 * leyendo primero de la hoja Config y usando valores por defecto si falta.
 */
function clasesParaPack(pack) {
  var clave = 'pack_' + pack.toLowerCase() + '_clases';
  var valor = parseInt(obtenerConfig(clave));
  if (!isNaN(valor)) return valor;

  // Fallback: valores definidos en el BRIEF
  var defaults = { Suelta: 0, Esencial: 4, Habito: 8, Estilo: 12 };
  return defaults[pack] !== undefined ? defaults[pack] : 0;
}

/**
 * Lee el valor de una clave en la hoja Config.
 * Devuelve null si la clave no existe.
 */
function obtenerConfig(clave) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJA_CONFIG);
  var data = hoja.getDataRange().getValues();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(clave).trim()) {
      return data[i][1];
    }
  }
  return null;
}

/**
 * Calcula el último día del mes de la fecha dada.
 * Truco: el día 0 del mes siguiente es el último día del mes actual.
 */
function ultimoDiaMes(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
}

/**
 * Comprueba si una fecha (fecha_fin de un pack) ya está vencida respecto a hoy.
 * Compara solo año-mes-día, ignorando la hora para evitar falsos positivos.
 */
function esFechaVencida(fechaRaw) {
  var hoy     = new Date();
  var fechaFin = new Date(fechaRaw);

  // Comparación de solo la parte de fecha (año, mes, día)
  if (hoy.getFullYear() !== fechaFin.getFullYear()) return hoy.getFullYear() > fechaFin.getFullYear();
  if (hoy.getMonth()    !== fechaFin.getMonth())    return hoy.getMonth()    > fechaFin.getMonth();
  return hoy.getDate() > fechaFin.getDate();
}

/**
 * Formatea una fecha como YYYY-MM-DD.
 * Si el valor no es una fecha válida, devuelve el valor original como string.
 */
function formatearFecha(fecha) {
  if (!fecha) return '';
  var d = new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha);

  var anio = d.getFullYear();
  var mes  = String(d.getMonth() + 1).padStart(2, '0');
  var dia  = String(d.getDate()).padStart(2, '0');
  return anio + '-' + mes + '-' + dia;
}

/**
 * Formatea una fecha como YYYY-MM-DD HH:mm (para el historial de asistencias).
 */
function formatearFechaHora(fecha) {
  if (!fecha) return '';
  var d = new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha);

  var horas = String(d.getHours()).padStart(2, '0');
  var mins  = String(d.getMinutes()).padStart(2, '0');
  return formatearFecha(d) + ' ' + horas + ':' + mins;
}

/**
 * Genera la URL del código QR usando la API de Google Charts.
 * El contenido del QR es el ID de la alumna (ej: A047).
 */
function generarQrUrl(alumnoId) {
  return 'https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=' + encodeURIComponent(alumnoId);
}

/** Devuelve true si el pack es uno de los valores permitidos. */
function esPackValido(pack) {
  return PACKS_VALIDOS.indexOf(pack) !== -1;
}

/** Inserta una fila en la hoja Asistencias. */
function insertarAsistencia(ss, alumnoId, nombre, estado) {
  var hoja = ss.getSheetByName(HOJA_ASISTENCIAS);
  hoja.appendRow([new Date(), alumnoId, nombre, estado]);
}

/** Copia superficial de un objeto (para no mutar e.parameter directamente). */
function copiarObjeto(obj) {
  var copia = {};
  Object.keys(obj).forEach(function (k) { copia[k] = obj[k]; });
  return copia;
}

/** Elimina espacios al inicio y al final de un string. Seguro con no-strings. */
function trim(val) {
  retuurn String(val).trim();
}

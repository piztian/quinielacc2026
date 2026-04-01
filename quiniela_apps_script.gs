/**
 * Apps Script para Quiniela Mundial 2026 — CeluCenter
 *
 * Soporta:
 *   GET  ?action=partidos&token=XXX                    → Lista de partidos
 *   GET  ?action=ranking&token=XXX                     → Ranking general
 *   GET  ?action=mis_predicciones&token=XXX&codigo=X   → Predicciones del usuario
 *   POST {action:"registrar", token, nombre, telefono, email, sucursal}  → Registrar participante
 *   POST {action:"predecir", token, codigo, predicciones:[{partidoId,goles1,goles2}]}  → Guardar predicciones
 *
 * Pestanas:
 *   "Partidos"       — Configuracion de partidos (admin)
 *   "Participantes"  — Registro de participantes
 *   "Predicciones"   — Predicciones individuales
 *
 * DESPLIEGUE:
 *   1. Crear Google Sheet con las pestanas indicadas arriba
 *   2. Copiar el SHEET_ID de la URL del Sheet
 *   3. Abrir Google Apps Script (script.google.com) > Nuevo proyecto
 *   4. Pegar este codigo (reemplazar todo el contenido)
 *   5. Actualizar SHEET_ID abajo
 *   6. Deploy > New deployment > Web app
 *   7. Execute as: Me, Access: Anyone
 *   8. Copiar la URL y pegarla en el HTML (APPS_SCRIPT_URL)
 *
 * ESTRUCTURA DE PESTANA "Partidos":
 *   A=ID | B=Ronda | C=Equipo1 | D=Equipo2 | E=Fecha | F=Hora | G=Sede | H=Goles1 | I=Goles2 | J=Cerrado
 *
 * ESTRUCTURA DE PESTANA "Participantes":
 *   A=Timestamp | B=Nombre | C=Telefono | D=Email | E=Sucursal | F=Codigo
 *
 * ESTRUCTURA DE PESTANA "Predicciones":
 *   A=Timestamp | B=Codigo | C=PartidoID | D=Goles1 | E=Goles2
 */

var TOKEN = 'CELUCENTER_QUINIELA_2026';
var SHEET_ID = '1HXKmQjwOiQK1vkYgvLERrbRVhYYSyvPMSW3DJd0fn60';

var TAB_PARTIDOS      = 'Partidos';
var TAB_PARTICIPANTES = 'Participantes';
var TAB_PREDICCIONES  = 'Predicciones';

// Columnas Partidos (0-indexed)
var P_ID      = 0;  // A
var P_RONDA   = 1;  // B
var P_EQUIPO1 = 2;  // C
var P_EQUIPO2 = 3;  // D
var P_FECHA   = 4;  // E
var P_HORA    = 5;  // F
var P_SEDE    = 6;  // G
var P_GOLES1  = 7;  // H
var P_GOLES2  = 8;  // I
var P_CERRADO = 9;  // J

// ============================================================
// GET
// ============================================================
function doGet(e) {
  var params = e.parameter || {};

  if (params.token !== TOKEN) {
    return jsonResponse({ error: 'Token invalido' });
  }

  var action = params.action || 'partidos';

  if (action === 'partidos') {
    return getPartidos();
  } else if (action === 'ranking') {
    return getRanking();
  } else if (action === 'mis_predicciones') {
    return getMisPredicciones(params.codigo || '');
  }

  return jsonResponse({ error: 'Accion no reconocida' });
}

// ============================================================
// POST
// ============================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, message: 'Datos invalidos' });
  }

  if (body.token !== TOKEN) {
    return jsonResponse({ success: false, message: 'Token invalido' });
  }

  var action = body.action || '';

  if (action === 'registrar') {
    return doRegistrar(body);
  } else if (action === 'predecir') {
    return doPredecir(body);
  }

  return jsonResponse({ success: false, message: 'Accion no reconocida' });
}

// ============================================================
// PARTIDOS — Lista de partidos activos
// ============================================================
function getPartidos() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_PARTIDOS);

  if (!sheet) {
    return jsonResponse({ partidos: [], error: 'Pestana Partidos no encontrada' });
  }

  var data = sheet.getDataRange().getValues();
  var partidos = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = String(row[P_ID] || '').trim();
    if (!id) continue;

    var cerrado = String(row[P_CERRADO] || '').trim().toUpperCase();
    var goles1 = row[P_GOLES1];
    var goles2 = row[P_GOLES2];

    partidos.push({
      id: id,
      ronda: String(row[P_RONDA] || '').trim(),
      equipo1: String(row[P_EQUIPO1] || '').trim(),
      equipo2: String(row[P_EQUIPO2] || '').trim(),
      fecha: formatFecha(row[P_FECHA]),
      hora: String(row[P_HORA] || '').trim(),
      sede: String(row[P_SEDE] || '').trim(),
      goles1: (goles1 !== '' && goles1 !== null && goles1 !== undefined) ? Number(goles1) : null,
      goles2: (goles2 !== '' && goles2 !== null && goles2 !== undefined) ? Number(goles2) : null,
      cerrado: (cerrado === 'TRUE' || cerrado === 'SI' || cerrado === 'VERDADERO')
    });
  }

  return jsonResponse({ partidos: partidos });
}

// ============================================================
// REGISTRAR — Registrar nuevo participante
// ============================================================
function doRegistrar(body) {
  var nombre   = String(body.nombre || '').trim();
  var telefono = String(body.telefono || '').trim();
  var email    = String(body.email || '').trim();
  var sucursal = String(body.sucursal || '').trim();

  // Validaciones
  if (!nombre || nombre.length < 3) {
    return jsonResponse({ success: false, message: 'Ingresa tu nombre completo' });
  }
  if (!/^\d{10}$/.test(telefono)) {
    return jsonResponse({ success: false, message: 'Telefono debe tener 10 digitos' });
  }
  if (!email || email.indexOf('@') === -1) {
    return jsonResponse({ success: false, message: 'Correo invalido' });
  }
  if (!sucursal) {
    return jsonResponse({ success: false, message: 'Selecciona una sucursal' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_PARTICIPANTES);

  // Crear pestana si no existe
  if (!sheet) {
    sheet = ss.insertSheet(TAB_PARTICIPANTES);
    sheet.appendRow(['Timestamp', 'Nombre', 'Telefono', 'Email', 'Sucursal', 'Codigo']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  var data = sheet.getDataRange().getValues();

  // Verificar si el telefono ya esta registrado
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() === telefono) {
      return jsonResponse({
        success: true,
        message: 'Ya estas registrado. Bienvenido de vuelta.',
        codigo: String(data[i][5]).trim(),
        nombre: String(data[i][1]).trim()
      });
    }
  }

  // Generar codigo unico
  var codigo = generarCodigo(telefono);
  var now = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm:ss');

  sheet.appendRow([now, nombre, telefono, email, sucursal, codigo]);

  return jsonResponse({
    success: true,
    message: 'Registro exitoso. ¡Ya puedes hacer tus predicciones!',
    codigo: codigo,
    nombre: nombre
  });
}

// ============================================================
// PREDECIR — Guardar predicciones
// ============================================================
function doPredecir(body) {
  var codigo = String(body.codigo || '').trim();
  var predicciones = body.predicciones || [];

  if (!codigo) {
    return jsonResponse({ success: false, message: 'Codigo de participante requerido' });
  }
  if (!predicciones.length) {
    return jsonResponse({ success: false, message: 'No hay predicciones para guardar' });
  }

  // Verificar que el codigo existe
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var partSheet = ss.getSheetByName(TAB_PARTICIPANTES);
  if (!partSheet) {
    return jsonResponse({ success: false, message: 'Error interno: sin participantes' });
  }

  var partData = partSheet.getDataRange().getValues();
  var codigoValido = false;
  for (var i = 1; i < partData.length; i++) {
    if (String(partData[i][5]).trim() === codigo) {
      codigoValido = true;
      break;
    }
  }
  if (!codigoValido) {
    return jsonResponse({ success: false, message: 'Codigo de participante invalido' });
  }

  // Obtener partidos para verificar cuales estan cerrados
  var matchSheet = ss.getSheetByName(TAB_PARTIDOS);
  var matchData = matchSheet ? matchSheet.getDataRange().getValues() : [];
  var partidosCerrados = {};
  for (var m = 1; m < matchData.length; m++) {
    var mid = String(matchData[m][P_ID] || '').trim();
    var cerr = String(matchData[m][P_CERRADO] || '').trim().toUpperCase();
    // Verificar si ya inicio por fecha/hora
    var fechaPartido = matchData[m][P_FECHA];
    var horaPartido = String(matchData[m][P_HORA] || '').trim();
    var yaInicio = verificarSiInicio(fechaPartido, horaPartido);
    if (cerr === 'TRUE' || cerr === 'SI' || cerr === 'VERDADERO' || yaInicio) {
      partidosCerrados[mid] = true;
    }
  }

  // Guardar predicciones
  var predSheet = ss.getSheetByName(TAB_PREDICCIONES);
  if (!predSheet) {
    predSheet = ss.insertSheet(TAB_PREDICCIONES);
    predSheet.appendRow(['Timestamp', 'Codigo', 'PartidoID', 'Goles1', 'Goles2']);
    predSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }

  // Leer predicciones existentes de este usuario
  var predData = predSheet.getDataRange().getValues();
  var existentes = {}; // partidoId -> row number (1-based)
  for (var p = 1; p < predData.length; p++) {
    if (String(predData[p][1]).trim() === codigo) {
      existentes[String(predData[p][2]).trim()] = p + 1; // 1-based row
    }
  }

  var now = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm:ss');
  var guardadas = 0;
  var bloqueadas = 0;

  for (var j = 0; j < predicciones.length; j++) {
    var pred = predicciones[j];
    var pid = String(pred.partidoId || '').trim();
    var g1 = parseInt(pred.goles1, 10);
    var g2 = parseInt(pred.goles2, 10);

    if (!pid || isNaN(g1) || isNaN(g2) || g1 < 0 || g2 < 0) continue;

    // No permitir predicciones en partidos cerrados/iniciados
    if (partidosCerrados[pid]) {
      bloqueadas++;
      continue;
    }

    if (existentes[pid]) {
      // Actualizar prediccion existente
      var rowNum = existentes[pid];
      predSheet.getRange(rowNum, 1).setValue(now);
      predSheet.getRange(rowNum, 4).setValue(g1);
      predSheet.getRange(rowNum, 5).setValue(g2);
    } else {
      // Nueva prediccion
      predSheet.appendRow([now, codigo, pid, g1, g2]);
    }
    guardadas++;
  }

  var msg = guardadas + ' prediccion(es) guardada(s).';
  if (bloqueadas > 0) {
    msg += ' ' + bloqueadas + ' partido(s) ya iniciaron y no se pudieron modificar.';
  }

  return jsonResponse({ success: true, message: msg, guardadas: guardadas, bloqueadas: bloqueadas });
}

// ============================================================
// MIS PREDICCIONES — Predicciones de un usuario
// ============================================================
function getMisPredicciones(codigo) {
  codigo = String(codigo).trim();
  if (!codigo) {
    return jsonResponse({ predicciones: [], error: 'Codigo requerido' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var predSheet = ss.getSheetByName(TAB_PREDICCIONES);

  if (!predSheet) {
    return jsonResponse({ predicciones: [] });
  }

  var data = predSheet.getDataRange().getValues();
  var predicciones = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === codigo) {
      predicciones.push({
        partidoId: String(data[i][2]).trim(),
        goles1: Number(data[i][3]),
        goles2: Number(data[i][4])
      });
    }
  }

  return jsonResponse({ predicciones: predicciones });
}

// ============================================================
// RANKING — Calcular y devolver ranking general
// ============================================================
function getRanking() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // Obtener partidos cerrados con resultados
  var matchSheet = ss.getSheetByName(TAB_PARTIDOS);
  if (!matchSheet) {
    return jsonResponse({ ranking: [] });
  }
  var matchData = matchSheet.getDataRange().getValues();

  var resultados = {}; // id -> {goles1, goles2}
  for (var m = 1; m < matchData.length; m++) {
    var cerr = String(matchData[m][P_CERRADO] || '').trim().toUpperCase();
    if (cerr !== 'TRUE' && cerr !== 'SI' && cerr !== 'VERDADERO') continue;

    var mid = String(matchData[m][P_ID] || '').trim();
    var g1 = matchData[m][P_GOLES1];
    var g2 = matchData[m][P_GOLES2];
    if (g1 === '' || g1 === null || g1 === undefined) continue;
    if (g2 === '' || g2 === null || g2 === undefined) continue;

    resultados[mid] = { goles1: Number(g1), goles2: Number(g2) };
  }

  // Obtener participantes
  var partSheet = ss.getSheetByName(TAB_PARTICIPANTES);
  if (!partSheet) {
    return jsonResponse({ ranking: [] });
  }
  var partData = partSheet.getDataRange().getValues();

  var participantes = {}; // codigo -> {nombre, sucursal}
  for (var p = 1; p < partData.length; p++) {
    var cod = String(partData[p][5] || '').trim();
    if (!cod) continue;
    participantes[cod] = {
      nombre: String(partData[p][1] || '').trim(),
      sucursal: String(partData[p][4] || '').trim()
    };
  }

  // Obtener predicciones y calcular puntos
  var predSheet = ss.getSheetByName(TAB_PREDICCIONES);
  if (!predSheet) {
    // Ranking sin predicciones: todos con 0
    var rankSinPred = [];
    for (var cod in participantes) {
      rankSinPred.push({
        codigo: cod,
        nombre: participantes[cod].nombre,
        sucursal: participantes[cod].sucursal,
        puntos: 0,
        exactos: 0,
        aciertos: 0
      });
    }
    return jsonResponse({ ranking: rankSinPred });
  }

  var predData = predSheet.getDataRange().getValues();

  // Calcular puntos por participante
  var puntos = {}; // codigo -> {puntos, exactos, aciertos}
  for (var cod in participantes) {
    puntos[cod] = { puntos: 0, exactos: 0, aciertos: 0 };
  }

  for (var i = 1; i < predData.length; i++) {
    var userCod = String(predData[i][1] || '').trim();
    var partidoId = String(predData[i][2] || '').trim();
    var predG1 = Number(predData[i][3]);
    var predG2 = Number(predData[i][4]);

    if (!userCod || !partidoId) continue;
    if (!resultados[partidoId]) continue; // Partido no cerrado aun
    if (!puntos[userCod]) puntos[userCod] = { puntos: 0, exactos: 0, aciertos: 0 };

    var real = resultados[partidoId];
    var pts = calcularPuntos(predG1, predG2, real.goles1, real.goles2);

    puntos[userCod].puntos += pts;
    if (pts === 3) puntos[userCod].exactos++;
    if (pts === 1) puntos[userCod].aciertos++;
  }

  // Armar ranking ordenado
  var ranking = [];
  for (var cod in participantes) {
    var p = puntos[cod] || { puntos: 0, exactos: 0, aciertos: 0 };
    ranking.push({
      codigo: cod,
      nombre: participantes[cod].nombre,
      sucursal: participantes[cod].sucursal,
      puntos: p.puntos,
      exactos: p.exactos,
      aciertos: p.aciertos
    });
  }

  // Ordenar: primero por puntos, luego por exactos, luego por nombre
  ranking.sort(function(a, b) {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.exactos !== a.exactos) return b.exactos - a.exactos;
    return a.nombre.localeCompare(b.nombre);
  });

  return jsonResponse({ ranking: ranking });
}

// ============================================================
// PUNTUACION
// ============================================================
function calcularPuntos(predG1, predG2, realG1, realG2) {
  // Resultado exacto = 3 puntos
  if (predG1 === realG1 && predG2 === realG2) {
    return 3;
  }

  // Acertar ganador o empate = 1 punto
  var predResultado = Math.sign(predG1 - predG2); // 1=equipo1, -1=equipo2, 0=empate
  var realResultado = Math.sign(realG1 - realG2);

  if (predResultado === realResultado) {
    return 1;
  }

  return 0;
}

// ============================================================
// HELPERS
// ============================================================
function generarCodigo(telefono) {
  // Genera un codigo unico basado en telefono + timestamp
  var raw = telefono + '_' + new Date().getTime();
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  var code = '';
  for (var i = 0; i < 4; i++) {
    code += ('0' + (hash[i] & 0xFF).toString(16)).slice(-2);
  }
  return code.toUpperCase();
}

function formatFecha(val) {
  if (!val) return '';
  try {
    if (val instanceof Date) {
      return Utilities.formatDate(val, 'America/Mexico_City', 'yyyy-MM-dd');
    }
    return String(val).trim();
  } catch (e) {
    return String(val).trim();
  }
}

function verificarSiInicio(fecha, hora) {
  try {
    if (!fecha) return false;
    var fechaStr = '';
    if (fecha instanceof Date) {
      fechaStr = Utilities.formatDate(fecha, 'America/Mexico_City', 'yyyy-MM-dd');
    } else {
      fechaStr = String(fecha).trim();
    }
    if (!hora) hora = '00:00';
    var dateTime = new Date(fechaStr + 'T' + hora + ':00-06:00'); // CST
    return new Date() >= dateTime;
  } catch (e) {
    return false;
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SETUP — Ejecutar UNA VEZ para configurar headers y partidos iniciales
// Menu: Ejecutar > setupHojaQuiniela
// ============================================================
function setupHojaQuiniela() {
  var ss = SpreadsheetApp.openById(SHEET_ID);

  // ---- PARTIDOS ----
  var shPartidos = ss.getSheetByName(TAB_PARTIDOS);
  if (!shPartidos) {
    shPartidos = ss.insertSheet(TAB_PARTIDOS);
  }
  // Headers
  shPartidos.getRange(1, 1, 1, 10).setValues([[
    'ID', 'Ronda', 'Equipo1', 'Equipo2', 'Fecha', 'Hora', 'Sede', 'Goles1', 'Goles2', 'Cerrado'
  ]]);
  shPartidos.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#00a651').setFontColor('#ffffff');

  // 13 partidos Ronda 1: 3 de Mexico + 10 partidos clave fase de grupos
  var partidos = [
    // Mexico (Grupo A)
    ['M01', 'Grupo A',  'Mexico',         'Canada',          '2025-06-11', '20:00', 'Estadio Azteca, CDMX',         '', '', ''],
    ['M02', 'Grupo A',  'Mexico',         'Ecuador',         '2025-06-15', '17:00', 'Estadio Azteca, CDMX',         '', '', ''],
    ['M03', 'Grupo A',  'Mexico',         'Venezuela',       '2025-06-19', '20:00', 'Rose Bowl, Los Angeles',        '', '', ''],
    // Partidos clave
    ['M04', 'Grupo B',  'Estados Unidos', 'Colombia',        '2025-06-12', '18:00', 'SoFi Stadium, Los Angeles',     '', '', ''],
    ['M05', 'Grupo C',  'Argentina',      'Marruecos',       '2025-06-12', '20:00', 'Hard Rock Stadium, Miami',      '', '', ''],
    ['M06', 'Grupo D',  'Brasil',         'Japon',           '2025-06-13', '18:00', 'MetLife Stadium, New Jersey',   '', '', ''],
    ['M07', 'Grupo E',  'Francia',        'Australia',       '2025-06-13', '20:00', 'AT&T Stadium, Dallas',          '', '', ''],
    ['M08', 'Grupo F',  'Espana',         'Paises Bajos',    '2025-06-14', '18:00', 'Mercedes-Benz Stadium, Atlanta','', '', ''],
    ['M09', 'Grupo G',  'Inglaterra',     'Senegal',         '2025-06-14', '20:00', 'Lincoln Financial Field, Phila','', '', ''],
    ['M10', 'Grupo H',  'Alemania',       'Corea del Sur',   '2025-06-15', '20:00', 'NRG Stadium, Houston',          '', '', ''],
    ['M11', 'Grupo B',  'Estados Unidos', 'Uruguay',         '2025-06-16', '18:00', 'Levi\'s Stadium, San Francisco','', '', ''],
    ['M12', 'Grupo C',  'Argentina',      'Ecuador',         '2025-06-17', '20:00', 'Hard Rock Stadium, Miami',      '', '', ''],
    ['M13', 'Grupo D',  'Brasil',         'Nigeria',         '2025-06-18', '18:00', 'MetLife Stadium, New Jersey',   '', '', ''],
  ];

  if (shPartidos.getLastRow() <= 1) {
    shPartidos.getRange(2, 1, partidos.length, 10).setValues(partidos);
  }

  // Formato fecha
  shPartidos.getRange(2, 5, partidos.length, 1).setNumberFormat('yyyy-mm-dd');
  // Ancho columnas
  shPartidos.setColumnWidth(1, 50);   // ID
  shPartidos.setColumnWidth(2, 90);   // Ronda
  shPartidos.setColumnWidth(3, 140);  // Equipo1
  shPartidos.setColumnWidth(4, 140);  // Equipo2
  shPartidos.setColumnWidth(5, 100);  // Fecha
  shPartidos.setColumnWidth(6, 60);   // Hora
  shPartidos.setColumnWidth(7, 250);  // Sede
  shPartidos.setColumnWidth(8, 60);   // Goles1
  shPartidos.setColumnWidth(9, 60);   // Goles2
  shPartidos.setColumnWidth(10, 70);  // Cerrado

  // ---- PARTICIPANTES ----
  var shPart = ss.getSheetByName(TAB_PARTICIPANTES);
  if (!shPart) {
    shPart = ss.insertSheet(TAB_PARTICIPANTES);
  }
  shPart.getRange(1, 1, 1, 6).setValues([[
    'Timestamp', 'Nombre', 'Telefono', 'Email', 'Sucursal', 'Codigo'
  ]]);
  shPart.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#00a651').setFontColor('#ffffff');
  shPart.setColumnWidth(1, 150);
  shPart.setColumnWidth(2, 200);
  shPart.setColumnWidth(3, 120);
  shPart.setColumnWidth(4, 200);
  shPart.setColumnWidth(5, 180);
  shPart.setColumnWidth(6, 100);

  // ---- PREDICCIONES ----
  var shPred = ss.getSheetByName(TAB_PREDICCIONES);
  if (!shPred) {
    shPred = ss.insertSheet(TAB_PREDICCIONES);
  }
  shPred.getRange(1, 1, 1, 5).setValues([[
    'Timestamp', 'Codigo', 'PartidoID', 'Goles1', 'Goles2'
  ]]);
  shPred.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#00a651').setFontColor('#ffffff');
  shPred.setColumnWidth(1, 150);
  shPred.setColumnWidth(2, 100);
  shPred.setColumnWidth(3, 90);
  shPred.setColumnWidth(4, 60);
  shPred.setColumnWidth(5, 60);

  Logger.log('Setup completo: headers + 13 partidos cargados');
  SpreadsheetApp.getUi().alert('Listo! Headers configurados y 13 partidos de Ronda 1 cargados.');
}

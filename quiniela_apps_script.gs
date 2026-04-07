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
 *   A=Timestamp | B=Nombre | C=Telefono | D=Email | E=Sucursal | F=Codigo | G=Ticket
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
var P_HORA    = 5;  // F — hora tiempo del centro de Mexico (CDMX)
var P_SEDE    = 6;  // G
var P_GOLES1  = 7;  // H
var P_GOLES2  = 8;  // I
var P_CERRADO = 9;  // J
var P_CANAL   = 10; // K — canal de TV abierta (Canal 5 / Azteca 7)

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
      canal: String(row[P_CANAL] || '').trim(),
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
  var ticket   = String(body.ticket || '').trim();

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
  if (!ticket || ticket.length < 4) {
    return jsonResponse({ success: false, message: 'Ingresa un no. de ticket valido (minimo 4 caracteres)' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB_PARTICIPANTES);

  // Crear pestana si no existe
  if (!sheet) {
    sheet = ss.insertSheet(TAB_PARTICIPANTES);
    sheet.appendRow(['Timestamp', 'Nombre', 'Telefono', 'Email', 'Sucursal', 'Codigo', 'Ticket']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  var data = sheet.getDataRange().getValues();
  var ticketNorm = ticket.toLowerCase();

  // Verificar si el telefono ya esta registrado (login automatico)
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

  // Verificar si el ticket ya fue usado por otra persona
  for (var j = 1; j < data.length; j++) {
    var tExistente = String(data[j][6] || '').trim().toLowerCase();
    if (tExistente && tExistente === ticketNorm) {
      return jsonResponse({
        success: false,
        message: 'Este ticket ya fue registrado por otro participante. Usa un ticket de compra diferente.'
      });
    }
  }

  // Generar codigo unico
  var codigo = generarCodigo(telefono);
  var now = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm:ss');

  sheet.appendRow([now, nombre, telefono, email, sucursal, codigo, ticket]);

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
// PARTIDOS TV ABIERTA MEXICO — Mundial 2026
// Los partidos confirmados por Televisa + TV Azteca.
// Ambas televisoras transmiten los mismos encuentros:
//   - TV Azteca: Azteca 7
//   - Televisa: Canal 5 (y en algunos casos Las Estrellas / Nu9ve)
// La gente sin cable puede verlos TODOS por TV abierta.
//
// Fuente principal (horarios CDMX y canales confirmados):
//   https://www.youtube.com/watch?v=o6SEMLrQVq4
// Complementadas con: Mediotiempo, TV Azteca Deportes, Olympics.com,
// TUDN, Milenio, DAZN (abril 2026).
//
// HORARIOS: tiempo del centro de Mexico (CDMX, CST/CDT).
//
// NOTA: El partido por el TERCER LUGAR NO va por TV abierta,
// solo esta disponible en ViX Premium (pago).
//
// Columnas:
//   ID | Ronda | Equipo1 | Equipo2 | Fecha | Hora CDMX | Sede |
//   Goles1 | Goles2 | Cerrado | Canal
//
// Los equipos "Por definir" se completan cuando FIFA confirme el
// bracket. Los horarios y sedes de fases finales son estimados
// segun el fixture oficial de FIFA (confirmar cerca de la fecha).
// ============================================================
var PARTIDOS_TV_ABIERTA = [
  // --- FASE DE GRUPOS (17 partidos) ---
  ['M01', 'Grupo A',  'Mexico',          'Sudafrica',      '2026-06-11', '13:00', 'Estadio Ciudad de Mexico (INAUGURAL)',  '', '', '', 'Azteca 7 / Canal 5'],
  ['M02', 'Grupo D',  'Estados Unidos',  'Paraguay',       '2026-06-12', '19:00', 'SoFi Stadium, Los Angeles',             '', '', '', 'Azteca 7 / Canal 5'],
  ['M03', 'Grupo E',  'Brasil',          'Marruecos',      '2026-06-13', '16:00', 'MetLife Stadium, Nueva York/NJ',        '', '', '', 'Azteca 7 / Canal 5'],
  ['M04', 'Grupo G',  'Paises Bajos',    'Japon',          '2026-06-14', '14:00', 'AT&T Stadium, Dallas',                  '', '', '', 'Azteca 7 / Canal 5'],
  ['M05', 'Grupo H',  'Argentina',       'Argelia',        '2026-06-16', '19:00', 'Arrowhead Stadium, Kansas City',        '', '', '', 'Azteca 7 / Canal 5'],
  ['M06', 'Grupo B',  'Inglaterra',      'Croacia',        '2026-06-17', '14:00', 'AT&T Stadium, Dallas',                  '', '', '', 'Azteca 7 / Canal 5'],
  ['M07', 'Grupo A',  'Mexico',          'Corea del Sur',  '2026-06-18', '19:00', 'Estadio Guadalajara',                   '', '', '', 'Azteca 7 / Canal 5'],
  ['M08', 'Grupo E',  'Brasil',          'Haiti',          '2026-06-19', '16:00', 'Lincoln Financial Field, Philadelphia', '', '', '', 'Azteca 7 / Canal 5'],
  ['M09', 'Grupo G',  'Paises Bajos',    'Suecia',         '2026-06-20', '11:00', 'NRG Stadium, Houston',                  '', '', '', 'Azteca 7 / Canal 5'],
  ['M10', 'Grupo F',  'Espana',          'Arabia Saudita', '2026-06-21', '10:00', 'Mercedes-Benz Stadium, Atlanta',        '', '', '', 'Azteca 7 / Canal 5'],
  ['M11', 'Grupo I',  'Noruega',         'Senegal',        '2026-06-22', '18:00', 'MetLife Stadium, Nueva York/NJ',        '', '', '', 'Azteca 7 / Canal 5'],
  ['M12', 'Grupo J',  'Colombia',        'Congo',          '2026-06-23', '20:00', 'Estadio Guadalajara',                   '', '', '', 'Azteca 7 / Canal 5'],
  ['M13', 'Grupo A',  'Chequia',         'Mexico',         '2026-06-24', '19:00', 'Estadio Ciudad de Mexico',              '', '', '', 'Azteca 7 / Canal 5'],
  ['M14', 'Grupo L',  'Ecuador',         'Alemania',       '2026-06-25', '14:00', 'MetLife Stadium, Nueva York/NJ',        '', '', '', 'Azteca 7 / Canal 5'],
  ['M15', 'Grupo F',  'Uruguay',         'Espana',         '2026-06-26', '18:00', 'Estadio Guadalajara',                   '', '', '', 'Azteca 7 / Canal 5'],
  ['M16', 'Grupo B',  'Panama',          'Inglaterra',     '2026-06-27', '15:00', 'MetLife Stadium, Nueva York/NJ',        '', '', '', 'Azteca 7 / Canal 5'],
  ['M17', 'Grupo J',  'Colombia',        'Portugal',       '2026-06-27', '17:30', 'Hard Rock Stadium, Miami',              '', '', '', 'Azteca 7 / Canal 5'],
  // NOTA: Las fases eliminatorias (Ronda 32, Octavos, Cuartos, Semis, Final)
  // se agregaran al Sheet conforme se definan los equipos que clasifican.
  // El tercer lugar NO va por TV abierta, solo ViX Premium.
];

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
  // Headers (11 columnas)
  shPartidos.getRange(1, 1, 1, 11).setValues([[
    'ID', 'Ronda', 'Equipo1', 'Equipo2', 'Fecha', 'Hora CDMX', 'Sede', 'Goles1', 'Goles2', 'Cerrado', 'Canal'
  ]]);
  shPartidos.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#00a651').setFontColor('#ffffff');

  var partidos = PARTIDOS_TV_ABIERTA;

  if (shPartidos.getLastRow() <= 1) {
    shPartidos.getRange(2, 1, partidos.length, 11).setValues(partidos);
  }

  // Formato fecha
  shPartidos.getRange(2, 5, partidos.length, 1).setNumberFormat('yyyy-mm-dd');
  // Ancho columnas
  shPartidos.setColumnWidth(1, 50);   // ID
  shPartidos.setColumnWidth(2, 90);   // Ronda
  shPartidos.setColumnWidth(3, 140);  // Equipo1
  shPartidos.setColumnWidth(4, 140);  // Equipo2
  shPartidos.setColumnWidth(5, 100);  // Fecha
  shPartidos.setColumnWidth(6, 80);   // Hora CDMX
  shPartidos.setColumnWidth(7, 260);  // Sede
  shPartidos.setColumnWidth(8, 60);   // Goles1
  shPartidos.setColumnWidth(9, 60);   // Goles2
  shPartidos.setColumnWidth(10, 70);  // Cerrado
  shPartidos.setColumnWidth(11, 160); // Canal

  // ---- PARTICIPANTES ----
  var shPart = ss.getSheetByName(TAB_PARTICIPANTES);
  if (!shPart) {
    shPart = ss.insertSheet(TAB_PARTICIPANTES);
  }
  shPart.getRange(1, 1, 1, 7).setValues([[
    'Timestamp', 'Nombre', 'Telefono', 'Email', 'Sucursal', 'Codigo', 'Ticket'
  ]]);
  shPart.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#00a651').setFontColor('#ffffff');
  shPart.setColumnWidth(1, 150);
  shPart.setColumnWidth(2, 200);
  shPart.setColumnWidth(3, 120);
  shPart.setColumnWidth(4, 200);
  shPart.setColumnWidth(5, 180);
  shPart.setColumnWidth(6, 100);
  shPart.setColumnWidth(7, 140);

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

  Logger.log('Setup completo: headers + ' + partidos.length + ' partidos de TV abierta cargados');
  try {
    SpreadsheetApp.getUi().alert('Listo! Headers configurados y ' + partidos.length + ' partidos de TV abierta cargados.');
  } catch (e) {}
}

// ============================================================
// RECARGAR PARTIDOS TV ABIERTA
// Reemplaza todos los partidos existentes con los 32 de TV abierta.
// Usar cuando ya hay partidos viejos/ficticios y quieres resetear.
// ADVERTENCIA: borra las predicciones que apunten a partidos con otro ID.
// Menu: Ejecutar > recargarPartidosTVAbierta
// ============================================================
function recargarPartidosTVAbierta() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(TAB_PARTIDOS);
  if (!sh) {
    sh = ss.insertSheet(TAB_PARTIDOS);
  }

  // Limpiar todas las filas de datos (mantener header)
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, 11).clearContent();
  }

  // Headers (11 columnas, por si no existen o estan viejos)
  sh.getRange(1, 1, 1, 11).setValues([[
    'ID', 'Ronda', 'Equipo1', 'Equipo2', 'Fecha', 'Hora CDMX', 'Sede', 'Goles1', 'Goles2', 'Cerrado', 'Canal'
  ]]);
  sh.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#00a651').setFontColor('#ffffff');

  // Insertar los 32 partidos de TV abierta
  var partidos = PARTIDOS_TV_ABIERTA;
  sh.getRange(2, 1, partidos.length, 11).setValues(partidos);

  // Formato fecha
  sh.getRange(2, 5, partidos.length, 1).setNumberFormat('yyyy-mm-dd');

  // Ancho columnas
  sh.setColumnWidth(1, 50);
  sh.setColumnWidth(2, 90);
  sh.setColumnWidth(3, 140);
  sh.setColumnWidth(4, 140);
  sh.setColumnWidth(5, 100);
  sh.setColumnWidth(6, 80);
  sh.setColumnWidth(7, 260);
  sh.setColumnWidth(8, 60);
  sh.setColumnWidth(9, 60);
  sh.setColumnWidth(10, 70);
  sh.setColumnWidth(11, 160);

  Logger.log('Recarga completa: ' + partidos.length + ' partidos de TV abierta');
  try {
    SpreadsheetApp.getUi().alert(
      'Partidos recargados: ' + partidos.length + ' partidos de TV abierta (Televisa + TV Azteca).\n\n' +
      '17 de fase de grupos + 15 placeholders para fases finales.\n\n' +
      'Horarios en tiempo del centro de Mexico (CDMX).\n' +
      'Todos se transmiten por Azteca 7 y Canal 5.\n\n' +
      'Actualiza los equipos "Por definir" conforme FIFA confirme el bracket.'
    );
  } catch (e) {}
}

// Manejo de errores centralizado: todo error termina aquí y se responde en español.

// Error de una regla del negocio (por ejemplo "la propuesta ya fue vendida").
// Lleva el código HTTP que se debe responder.
class ErrorNegocio extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

// Mensajes para las restricciones UNIQUE y CHECK del script zimbra.sql.
// La llave es el nombre de la restricción.
const MENSAJES = {
  uq_empleado_documento: 'Ya existe un empleado con ese documento.',
  uq_empleado_correo: 'Ya existe un empleado con ese correo.',
  uq_usuario_nombre: 'Ese nombre de usuario ya está en uso.',
  uq_usuario_empleado: 'Ese empleado ya tiene un usuario.',
  uq_producto_nombre: 'Ya existe un producto con ese nombre.',
  uq_prospecto_correo: 'Ya existe un prospecto con ese correo.',
  uq_venta_propuesta: 'Esta propuesta ya fue convertida en venta.',
  uq_factura_venta: 'Esta venta ya tiene factura.',
  uq_factura_numero: 'Ya existe una factura con ese número.',
  chk_producto_precio: 'El precio por buzón no puede ser negativo.',
  chk_producto_prueba: 'Una versión de prueba debe tener precio 0.',
  chk_prospecto_correo: 'El correo no tiene un formato válido.',
  chk_prospecto_puntaje: 'El puntaje no puede ser negativo.',
  chk_propuesta_buzones: 'La cantidad de buzones debe ser mayor que cero.',
  chk_propuesta_total: 'El total de la propuesta no cuadra con buzones × precio.',
  chk_factura_saldo: 'El saldo de la factura no puede quedar negativo ni superar el total.',
  chk_pago_valor: 'El valor del pago debe ser mayor que cero.',
  chk_venta_anulacion: 'Para anular una venta hay que escribir el motivo.',
};

// Busca en el mensaje de MySQL el nombre de una restricción conocida.
function buscarRestriccion(texto) {
  const nombre = Object.keys(MENSAJES).find((k) => texto.includes(k));
  return nombre ? MENSAJES[nombre] : null;
}

// Convierte un error de MySQL/MariaDB en { status, mensaje } para el usuario.
function traducir(err) {
  if (err instanceof ErrorNegocio) return { status: err.status, mensaje: err.message };

  const texto = err.sqlMessage || err.message || '';

  // CHECK que no se cumple: 3819 en MySQL 8 y 4025 en MariaDB.
  // Se revisa por número porque mysql2 le pone a 4025 un nombre de MySQL que significa otra cosa.
  if (err.errno === 3819 || err.errno === 4025) {
    return { status: 400, mensaje: buscarRestriccion(texto) || 'Algún dato no cumple las reglas de la base de datos.' };
  }

  switch (err.code) {
    case 'ER_DUP_ENTRY': // 1062: valor repetido en un UNIQUE
      return { status: 409, mensaje: buscarRestriccion(texto) || 'Ese registro ya existe (valor repetido).' };
    case 'ER_ROW_IS_REFERENCED_2': // 1451: borrar algo que otros registros usan
    case 'ER_ROW_IS_REFERENCED':
      return { status: 409, mensaje: 'No se puede borrar: hay otros registros que dependen de este.' };
    case 'ER_NO_REFERENCED_ROW_2': // 1452: la llave foránea apunta a algo que no existe
    case 'ER_NO_REFERENCED_ROW':
      return { status: 400, mensaje: 'Uno de los datos relacionados no existe (revisa prospecto, vendedor o producto).' };
    case 'ER_BAD_NULL_ERROR': // 1048
      return { status: 400, mensaje: 'Falta un dato obligatorio.' };
    case 'WARN_DATA_TRUNCATED': // 1265: valor fuera de la lista (ENUM)
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
      return { status: 400, mensaje: 'Uno de los valores no es válido para ese campo.' };
    case 'ER_DATA_TOO_LONG': // 1406
      return { status: 400, mensaje: 'Uno de los textos es demasiado largo.' };
    case 'ER_LOCK_WAIT_TIMEOUT':
    case 'ER_LOCK_DEADLOCK':
      return { status: 409, mensaje: 'Otro usuario está modificando este registro. Intenta de nuevo en un momento.' };
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
      return { status: 503, mensaje: 'No hay conexión con la base de datos. Revisa que MySQL esté encendido y el archivo .env.' };
    default:
      return { status: 500, mensaje: 'Ocurrió un error inesperado en el servidor.' };
  }
}

// Middleware de Express: el último de la cadena. Recibe cualquier error que se lance en una ruta.
function manejarErrores(err, req, res, next) {
  const { status, mensaje } = traducir(err);
  if (status >= 500) console.error(err); // los errores inesperados se ven en la consola
  res.status(status).json({ error: mensaje });
}

module.exports = { ErrorNegocio, manejarErrores };

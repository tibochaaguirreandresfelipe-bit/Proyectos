// Pool de conexiones a MySQL/MariaDB.
// Un pool guarda varias conexiones abiertas y las reparte entre las peticiones,
// así no se abre una conexión nueva cada vez.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zimbra_oneview',
  connectionLimit: 10,
  dateStrings: true,      // las fechas llegan como texto 'AAAA-MM-DD', sin líos de zona horaria
  decimalNumbers: true,   // los DECIMAL llegan como número y no como texto
  charset: 'utf8mb4',
});

// Modo estricto en cada conexión nueva: un dato inválido da error en vez de
// guardarse recortado (XAMPP trae el modo estricto apagado).
pool.on('connection', (conn) => {
  conn.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
});

module.exports = pool;

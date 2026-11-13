// Punto de entrada: arma el servidor Express, sirve el frontend y monta las rutas de la API.
require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./db');
const { manejarErrores } = require('./errores');

const app = express();
app.use(express.json());

// Frontend (HTML + JS) desde la carpeta public
app.use(express.static(path.join(__dirname, '..', 'public')));

// ¿Está viva la base de datos? El indicador "Conectado a MySQL" consulta esta ruta.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, bd: 'conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, bd: 'sin conexión', error: err.code });
  }
});

// Rutas de cada módulo (Express 5 pasa solo al manejador de errores
// cualquier error lanzado dentro de una función async)
app.use('/api', require('./rutas/dashboard'));
app.use('/api', require('./rutas/productos'));
app.use('/api', require('./rutas/prospectos'));
app.use('/api', require('./rutas/propuestas'));
app.use('/api', require('./rutas/facturas'));

// Ruta de la API que no existe
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Siempre al final: convierte cualquier error en un mensaje en español
app.use(manejarErrores);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Zimbra OneView listo en http://localhost:${PORT}`);
});

# Zimbra OneView: sistema transaccional

Proyecto de **Sistemas Transaccionales (UNIMINUTO)**. Simula el ciclo de venta de Zimbra:
prospecto → prueba de 60 días → propuesta → venta → factura → pagos, sobre MySQL/MariaDB con
transacciones ACID.

## Requisitos

- **Node.js 20 o superior** (probado con Node 24).
- **MySQL 8** o **MariaDB 10.4+**. Con **XAMPP** sirve: hay que encender MySQL en el panel de XAMPP.

## 1. Instalar

```powershell
npm install
```

## 2. Configurar el `.env`

Copien `.env.example` como `.env` y ajusten los datos. Con XAMPP el usuario es `root` y la contraseña va vacía:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=zimbra_oneview
PORT=3000
```

## 3. Crear la base y cargar los datos

**Opción A: consola** (desde la carpeta del proyecto, sirve en PowerShell o CMD):

```powershell
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 -e "source database/zimbra.sql"
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 -e "source database/seed.sql"
```

Si tienen MySQL 8 instalado aparte, cambien la ruta por la de su `mysql.exe` y agreguen `-p` si tiene contraseña.

**Opción B: phpMyAdmin** (`http://localhost/phpmyadmin`): pestaña *Importar*, primero `database/zimbra.sql` y
después `database/seed.sql`.

> ⚠️ `zimbra.sql` **borra y vuelve a crear** las tablas. Sirve para dejar la base limpia antes de una demostración.

| Archivo | Qué tiene |
|---|---|
| `database/zimbra.sql` | Las 12 tablas con sus llaves, UNIQUE, CHECK y ENUM |
| `database/seed.sql` | Datos de prueba coherentes: 32 empleados, 7 productos, 70 prospectos, 70 pruebas, ~470 actividades, 66 alertas, 81 contactos, 52 propuestas, 34 ventas, 34 facturas y 49 pagos |

Los usuarios de prueba tienen la contraseña `Zimbra2026*` (guardada cifrada con scrypt). El login llega en un sprint posterior.

## 4. Ejecutar

```powershell
npm run dev
```

Abran **http://localhost:3000**. Con `npm run dev` el servidor se reinicia solo cada vez que guardan un archivo.

## Estructura

```
database/       zimbra.sql (esquema) y seed.sql (datos)
src/server.js   servidor Express: sirve el frontend y monta la API
src/db.js       pool de conexiones a MySQL
src/errores.js  errores centralizados: traduce los errores de MySQL a español
src/rutas/      un archivo por módulo (dashboard, productos, prospectos, propuestas, facturas)
public/         frontend: index.html + un .js por módulo (Tailwind y Chart.js por CDN)
```

## Transacciones (lo central de la materia)

| Operación | Endpoint | Qué demuestra |
|---|---|---|
| Convertir propuesta en venta | `POST /api/propuestas/:id/venta` | `beginTransaction` → `SELECT … FOR UPDATE` → venta + factura + 3 cambios de estado → `COMMIT` o `ROLLBACK` |
| Lo mismo con error forzado | `POST /api/propuestas/:id/venta?simularError=true` | El error ocurre **después** de insertar la venta, y el `ROLLBACK` la deshace |
| Registrar prospecto + prueba | `POST /api/prospectos` | `SAVEPOINT`: si la prueba falla, `ROLLBACK TO SAVEPOINT` y el prospecto queda guardado (`?simularError=true` hace fallar la prueba) |
| Registrar pago | `POST /api/facturas/:id/pagos` | Pago y saldo juntos; rechaza pagos mayores al saldo; con saldo 0 la factura pasa a "Pagada" |

En la pantalla **Propuestas y ventas** está el interruptor **"Simular error (ROLLBACK)"** para mostrar esto en clase.
Otro endpoint útil: `GET /api/health` responde si la base está conectada.

**Detalle para explicar:** después de un ROLLBACK, el siguiente id de venta "se salta" un número. Es normal:
MySQL no devuelve los valores de AUTO_INCREMENT, aunque la fila no haya quedado guardada.

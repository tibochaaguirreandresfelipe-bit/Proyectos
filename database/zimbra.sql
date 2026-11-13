-- =====================================================================
-- Caso Zimbra - Sistema transaccional (Sistemas Transaccionales, UNIMINUTO)
-- Script de creación de la base de datos: 12 tablas, motor InnoDB.
-- Probado en MariaDB 10.4 (XAMPP) y escrito para que también corra en MySQL 8.
--
-- OJO: este script BORRA y vuelve a crear las tablas. Úsenlo solo para
-- dejar la base limpia; después carguen database/seed.sql.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS zimbra_oneview
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zimbra_oneview;

SET NAMES utf8mb4;
-- Modo estricto: un valor inválido (por ejemplo un estado fuera del ENUM)
-- da error en lugar de guardarse "recortado".
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- Se borran en orden inverso a las dependencias (primero las hijas).
DROP TABLE IF EXISTS pago;
DROP TABLE IF EXISTS factura;
DROP TABLE IF EXISTS venta;
DROP TABLE IF EXISTS propuesta;
DROP TABLE IF EXISTS contacto;
DROP TABLE IF EXISTS alerta;
DROP TABLE IF EXISTS actividad_web;
DROP TABLE IF EXISTS prueba;
DROP TABLE IF EXISTS prospecto;
DROP TABLE IF EXISTS producto;
DROP TABLE IF EXISTS usuario;
DROP TABLE IF EXISTS empleado;

-- ---------------------------------------------------------------------
-- PA01 Talento humano y accesos
-- ---------------------------------------------------------------------
CREATE TABLE empleado (
  id_empleado    INT AUTO_INCREMENT PRIMARY KEY,
  documento      VARCHAR(20)  NOT NULL,
  nombres        VARCHAR(60)  NOT NULL,
  apellidos      VARCHAR(60)  NOT NULL,
  correo         VARCHAR(100) NOT NULL,
  telefono       VARCHAR(20)  NULL,
  cargo          ENUM('Administrador','Talento humano','Gerente de ventas','Vendedor','Cartera') NOT NULL,
  fecha_ingreso  DATE NOT NULL,
  fecha_retiro   DATE NULL,
  estado         ENUM('Activo','Retirado') NOT NULL DEFAULT 'Activo',
  CONSTRAINT uq_empleado_documento UNIQUE (documento),
  CONSTRAINT uq_empleado_correo    UNIQUE (correo),
  CONSTRAINT chk_empleado_retiro   CHECK (fecha_retiro IS NULL OR fecha_retiro > fecha_ingreso),
  -- Un empleado retirado debe tener fecha de retiro, y uno activo no.
  CONSTRAINT chk_empleado_estado   CHECK ((estado = 'Retirado') = (fecha_retiro IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE usuario (
  id_usuario       INT AUTO_INCREMENT PRIMARY KEY,
  id_empleado      INT NOT NULL,
  nombre_usuario   VARCHAR(40)  NOT NULL,
  contrasena_hash  VARCHAR(255) NOT NULL,
  rol              ENUM('Administrador','Talento humano','Gerente de ventas','Vendedor','Cartera') NOT NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_usuario_empleado UNIQUE (id_empleado),   -- un usuario por empleado
  CONSTRAINT uq_usuario_nombre   UNIQUE (nombre_usuario),
  CONSTRAINT fk_usuario_empleado FOREIGN KEY (id_empleado) REFERENCES empleado (id_empleado)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PA02 Catálogo de productos
-- ---------------------------------------------------------------------
CREATE TABLE producto (
  id_producto   INT AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  descripcion   VARCHAR(255) NULL,
  tipo_version  ENUM('Prueba','Comercial') NOT NULL,
  precio_buzon  DECIMAL(10,2) NOT NULL,          -- USD por buzón al año
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_producto_nombre  UNIQUE (nombre),
  CONSTRAINT chk_producto_precio CHECK (precio_buzon >= 0),
  -- La versión de prueba es gratis.
  CONSTRAINT chk_producto_prueba CHECK (tipo_version = 'Comercial' OR precio_buzon = 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PM01 Captación de prospectos
-- No hay tabla "cliente": un cliente es un prospecto con estado 'Cliente'.
-- ---------------------------------------------------------------------
CREATE TABLE prospecto (
  id_prospecto    INT AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL,
  empresa         VARCHAR(100) NULL,
  correo          VARCHAR(100) NOT NULL,
  telefono        VARCHAR(20)  NULL,
  pais            VARCHAR(60)  NOT NULL,
  canal           ENUM('Búsqueda orgánica','Publicidad','Redes sociales','Referido','Correo') NOT NULL,
  puntaje         INT NOT NULL DEFAULT 0,
  estado          ENUM('Nuevo','Calificado','En contacto','Cliente','Descartado') NOT NULL DEFAULT 'Nuevo',
  id_vendedor     INT NULL,                       -- se asigna al calificarse (RF08)
  fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_prospecto_correo    UNIQUE (correo),
  CONSTRAINT chk_prospecto_puntaje  CHECK (puntaje >= 0),
  CONSTRAINT chk_prospecto_correo   CHECK (correo LIKE '%_@_%._%'),
  CONSTRAINT fk_prospecto_vendedor  FOREIGN KEY (id_vendedor) REFERENCES empleado (id_empleado)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_prospecto_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE prueba (
  id_prueba          INT AUTO_INCREMENT PRIMARY KEY,
  id_prospecto       INT NOT NULL,
  id_producto        INT NOT NULL,
  fecha_inicio       DATE NOT NULL,
  fecha_vencimiento  DATE NOT NULL,               -- fecha_inicio + 60 días
  estado             ENUM('Activa','Vencida','Convertida') NOT NULL DEFAULT 'Activa',
  CONSTRAINT chk_prueba_fechas     CHECK (fecha_vencimiento > fecha_inicio),
  CONSTRAINT fk_prueba_prospecto   FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_prueba_producto    FOREIGN KEY (id_producto) REFERENCES producto (id_producto)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PM02 Seguimiento y calificación
-- ---------------------------------------------------------------------
CREATE TABLE actividad_web (
  id_actividad  INT AUTO_INCREMENT PRIMARY KEY,
  id_prospecto  INT NOT NULL,
  tipo          ENUM('Visita','Descarga','Página de precios','Apertura de correo','Clic en correo','Webinar') NOT NULL,
  puntos        INT NOT NULL,
  fecha_hora    DATETIME NOT NULL,
  CONSTRAINT chk_actividad_puntos   CHECK (puntos >= 0),
  CONSTRAINT fk_actividad_prospecto FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PM03 Gestión comercial
-- ---------------------------------------------------------------------
CREATE TABLE alerta (
  id_alerta     INT AUTO_INCREMENT PRIMARY KEY,
  id_actividad  INT NOT NULL,
  id_vendedor   INT NOT NULL,
  fecha_hora    DATETIME NOT NULL,
  atendida      BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_alerta_actividad FOREIGN KEY (id_actividad) REFERENCES actividad_web (id_actividad)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_alerta_vendedor  FOREIGN KEY (id_vendedor) REFERENCES empleado (id_empleado)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE contacto (
  id_contacto   INT AUTO_INCREMENT PRIMARY KEY,
  id_prospecto  INT NOT NULL,
  id_vendedor   INT NOT NULL,
  fecha_hora    DATETIME NOT NULL,
  medio         ENUM('Teléfono','Correo') NOT NULL,
  resultado     ENUM('Interesado','No contesta','Pidió propuesta','No interesado') NOT NULL,
  notas         VARCHAR(255) NULL,
  CONSTRAINT fk_contacto_prospecto FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_contacto_vendedor  FOREIGN KEY (id_vendedor) REFERENCES empleado (id_empleado)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE propuesta (
  id_propuesta      INT AUTO_INCREMENT PRIMARY KEY,
  id_prospecto      INT NOT NULL,
  id_vendedor       INT NOT NULL,
  id_producto       INT NOT NULL,
  fecha             DATE NOT NULL,
  fecha_validez     DATE NOT NULL,                -- fecha + 15 días (RF10)
  cantidad_buzones  INT NOT NULL,
  precio_unitario   DECIMAL(10,2) NOT NULL,       -- copia del precio del producto ese día
  total             DECIMAL(12,2) NOT NULL,
  estado            ENUM('Enviada','Aceptada','Rechazada','Vencida') NOT NULL DEFAULT 'Enviada',
  CONSTRAINT chk_propuesta_buzones CHECK (cantidad_buzones > 0),
  CONSTRAINT chk_propuesta_precio  CHECK (precio_unitario >= 0),
  CONSTRAINT chk_propuesta_total   CHECK (total = cantidad_buzones * precio_unitario),
  CONSTRAINT chk_propuesta_fechas  CHECK (fecha_validez > fecha),
  CONSTRAINT fk_propuesta_prospecto FOREIGN KEY (id_prospecto) REFERENCES prospecto (id_prospecto)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_propuesta_vendedor  FOREIGN KEY (id_vendedor) REFERENCES empleado (id_empleado)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_propuesta_producto  FOREIGN KEY (id_producto) REFERENCES producto (id_producto)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_propuesta_estado (estado)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PM04 Venta y cobro: propuesta -> venta -> factura (1 a 1) -> pagos (1 a N)
-- ---------------------------------------------------------------------
CREATE TABLE venta (
  id_venta          INT AUTO_INCREMENT PRIMARY KEY,
  id_propuesta      INT NOT NULL,
  fecha_venta       DATETIME NOT NULL,
  total             DECIMAL(12,2) NOT NULL,
  estado            ENUM('Activa','Anulada') NOT NULL DEFAULT 'Activa',
  motivo_anulacion  VARCHAR(255) NULL,
  CONSTRAINT uq_venta_propuesta  UNIQUE (id_propuesta),   -- una venta por propuesta
  CONSTRAINT chk_venta_total     CHECK (total >= 0),
  CONSTRAINT chk_venta_anulacion CHECK (estado = 'Activa' OR (motivo_anulacion IS NOT NULL AND motivo_anulacion <> '')),
  CONSTRAINT fk_venta_propuesta  FOREIGN KEY (id_propuesta) REFERENCES propuesta (id_propuesta)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_venta_fecha (fecha_venta)
) ENGINE=InnoDB;

CREATE TABLE factura (
  id_factura         INT AUTO_INCREMENT PRIMARY KEY,
  id_venta           INT NOT NULL,
  numero             VARCHAR(20) NOT NULL,
  fecha_emision      DATE NOT NULL,
  fecha_vencimiento  DATE NOT NULL,               -- fecha_emision + 30 días
  valor_total        DECIMAL(12,2) NOT NULL,
  saldo              DECIMAL(12,2) NOT NULL,
  estado             ENUM('Pendiente','Pagada','Vencida','Anulada') NOT NULL DEFAULT 'Pendiente',
  CONSTRAINT uq_factura_venta   UNIQUE (id_venta),        -- una factura por venta
  CONSTRAINT uq_factura_numero  UNIQUE (numero),
  CONSTRAINT chk_factura_valor  CHECK (valor_total >= 0),
  CONSTRAINT chk_factura_saldo  CHECK (saldo >= 0 AND saldo <= valor_total),
  CONSTRAINT chk_factura_fechas CHECK (fecha_vencimiento >= fecha_emision),
  CONSTRAINT fk_factura_venta   FOREIGN KEY (id_venta) REFERENCES venta (id_venta)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pago (
  id_pago     INT AUTO_INCREMENT PRIMARY KEY,
  id_factura  INT NOT NULL,
  fecha_pago  DATETIME NOT NULL,
  valor       DECIMAL(12,2) NOT NULL,
  medio_pago  ENUM('Transferencia','Tarjeta','Consignación') NOT NULL,
  CONSTRAINT chk_pago_valor   CHECK (valor > 0),
  CONSTRAINT fk_pago_factura  FOREIGN KEY (id_factura) REFERENCES factura (id_factura)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

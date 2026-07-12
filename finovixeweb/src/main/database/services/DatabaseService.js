const crypto = require('crypto');

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

class DatabaseService {
  static db = null;

  static _nowStr() {
    const offset = new Date().getTimezoneOffset() * 60000;
    return new Date(Date.now() - offset).toISOString().slice(0, 19).replace('T', ' ');
  }

  static _descontarStock(item) {
    if (item.es_por_peso) {
      const producto = this.db.prepare("SELECT stock_kg FROM productos WHERE id = ?").get(item.id);
      if (!producto || producto.stock_kg < item.peso_kg) {
        throw new Error(`Stock insuficiente (kg) para ${item.nombre}`);
      }
      const result = this.db.prepare("UPDATE productos SET stock_kg = stock_kg - ? WHERE id = ? AND stock_kg >= ?").run(item.peso_kg, item.id, item.peso_kg);
      if (result.changes === 0) {
        throw new Error(`No se pudo descontar stock en kg de ${item.nombre}`);
      }
    } else {
      const stockActual = this.db.prepare("SELECT stock FROM productos WHERE id = ?").get(item.id);
      if (!stockActual || stockActual.stock < item.cant) {
        throw new Error(`Stock insuficiente para ${item.nombre}`);
      }
      const result = this.db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?").run(item.cant, item.id, item.cant);
      if (result.changes === 0) {
        throw new Error(`No se pudo descontar stock de ${item.nombre}`);
      }
    }
  }

  static async init(database) {
    this.db = database;
    this.initDb();
    this.preparar_tablas_seguridad();
  }

  static initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS configuracion (clave TEXT PRIMARY KEY, valor TEXT);
      CREATE TABLE IF NOT EXISTS productos (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT UNIQUE, nombre TEXT, p_compra_bs REAL, p_compra_usd REAL, p_venta_bs REAL, p_venta_usd REAL, stock INTEGER, stock_critico INTEGER);
      CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, rif TEXT, telefono TEXT);
      CREATE TABLE IF NOT EXISTS ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, total_bs REAL, total_usd REAL, metodo TEXT, descuento REAL, cliente TEXT, fiado_id INTEGER, tasa_momento REAL, monto_recibido REAL, vuelto REAL, vuelto_entregado INTEGER DEFAULT 0, vuelto_metodo TEXT);
      CREATE TABLE IF NOT EXISTS ventas_detalle (id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id INTEGER, producto TEXT, cantidad REAL, precio_unitario REAL, fiado_detalle_id INTEGER, FOREIGN KEY(venta_id) REFERENCES ventas(id));
      CREATE TABLE IF NOT EXISTS fiados (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT, fecha TEXT, total_bs REAL, pagado INTEGER DEFAULT 0, tasa_momento REAL);
      CREATE TABLE IF NOT EXISTS fiados_detalle (id INTEGER PRIMARY KEY AUTOINCREMENT, fiado_id INTEGER, producto_id INTEGER, nombre_prod TEXT, cantidad REAL, precio_unitario REAL, pagado INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS gastos (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT, descripcion TEXT, monto_bs REAL, monto_usd REAL, metodo TEXT);
      CREATE TABLE IF NOT EXISTS proveedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, contacto TEXT, productos TEXT);
      CREATE TABLE IF NOT EXISTS cierres (fecha TEXT PRIMARY KEY, ingresos REAL, gastos REAL, neto REAL, estado TEXT, arqueo TEXT);
      CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, usuario TEXT UNIQUE NOT NULL, password TEXT NOT NULL, rol TEXT NOT NULL, ultimo_login TEXT, permisos TEXT DEFAULT 'todas');
      CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
      CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente);
      CREATE INDEX IF NOT EXISTS idx_fiados_cliente ON fiados(cliente);
      CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
      CREATE INDEX IF NOT EXISTS idx_cierres_fecha ON cierres(fecha);
      CREATE INDEX IF NOT EXISTS idx_productos_sku ON productos(sku);
      CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
    `);

    const migrations = [
      { table: 'ventas', column: 'tasa_momento', type: 'REAL' },
      { table: 'fiados', column: 'tasa_momento', type: 'REAL' },
      { table: 'usuarios', column: 'permisos', type: "TEXT DEFAULT 'todas'" },
      { table: 'ventas_detalle', column: 'fiado_detalle_id', type: 'INTEGER' },
      { table: 'fiados_detalle', column: 'fecha_agregado', type: 'TEXT' },
      { table: 'ventas', column: 'monto_recibido', type: 'REAL' },
      { table: 'ventas', column: 'vuelto', type: 'REAL' },
      { table: 'ventas', column: 'vuelto_entregado', type: 'INTEGER DEFAULT 0' },
      { table: 'ventas', column: 'vuelto_metodo', type: 'TEXT' },
      { table: 'ventas', column: 'monto_esperado_bs', type: 'REAL' },
      { table: 'ventas', column: 'monto_esperado_usd', type: 'REAL' },
      { table: 'productos', column: 'es_por_peso', type: 'INTEGER DEFAULT 0' },
      { table: 'productos', column: 'precio_kg_bs', type: 'REAL DEFAULT 0' },
      { table: 'productos', column: 'precio_kg_usd', type: 'REAL DEFAULT 0' },
      { table: 'productos', column: 'stock_kg', type: 'REAL DEFAULT 0' }
    ];

    for (const mig of migrations) {
      const col = this.db.prepare(
        `SELECT COUNT(*) as cnt FROM pragma_table_info('${mig.table}') WHERE name = ?`
      ).get(mig.column);
      if (!col || col.cnt === 0) {
        this.db.exec(`ALTER TABLE ${mig.table} ADD COLUMN ${mig.column} ${mig.type}`);
      }
    }

    this._migrateToRealIfNeeded('fiados_detalle', 'cantidad');
    this._migrateToRealIfNeeded('ventas_detalle', 'cantidad');

    this.db.prepare("INSERT OR IGNORE INTO configuracion VALUES ('tasa_usd', '1')").run();
    this.db.prepare("INSERT OR IGNORE INTO configuracion VALUES ('modo_tasa', 'Automático (BCV)')").run();
  }

  static _migrateToRealIfNeeded(table, column) {
    const colInfo = this.db.prepare(`SELECT type FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
    if (colInfo && colInfo.type.toUpperCase() === 'INTEGER') {
      this.db.exec(`CREATE TABLE ${table}_new AS SELECT * FROM ${table} WHERE 0`);
      this.db.exec(`ALTER TABLE ${table}_new ADD COLUMN ${column}_real REAL DEFAULT 0`);
      this.db.prepare(`INSERT INTO ${table}_new SELECT *, CAST(${column} AS REAL) FROM ${table}`).run();
      this.db.exec(`ALTER TABLE ${table}_new DROP COLUMN ${column}`);
      this.db.exec(`ALTER TABLE ${table}_new RENAME COLUMN ${column}_real TO ${column}`);
      this.db.exec(`DROP TABLE ${table}`);
      this.db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    }
  }

  static ejecutar_consulta(consulta, parametros = []) {
    const stmt = this.db.prepare(consulta);
    if (consulta.trim().toUpperCase().startsWith('SELECT')) return stmt.all(...parametros);
    return stmt.run(...parametros).lastInsertRowid || true;
  }

  static insertar_y_obtener_id(consulta, parametros = []) {
    return this.db.prepare(consulta).run(...parametros).lastInsertRowid;
  }

  static obtener_config(clave) {
    const result = this.db.prepare("SELECT valor FROM configuracion WHERE clave = ?").get(clave);
    return result ? result.valor : "0";
  }

  static buscar_productos(termino) {
    return this.db.prepare("SELECT * FROM productos WHERE nombre LIKE ? OR sku LIKE ?").all(`%${termino}%`, `%${termino}%`);
  }

  static obtener_producto_por_sku(sku) {
    return this.db.prepare("SELECT * FROM productos WHERE sku = ?").get(sku);
  }

  static buscar_fiados(termino) {
    const query = termino ? `%${termino}%` : '%';
    return this.db.prepare("SELECT id, cliente, fecha, total_bs, pagado, tasa_momento FROM fiados WHERE pagado = 0 AND cliente LIKE ? ORDER BY fecha DESC").all(query);
  }

  static agregar_producto(data) {
    return this.insertar_y_obtener_id(
      `INSERT INTO productos (sku, nombre, p_compra_bs, p_compra_usd, p_venta_bs, p_venta_usd, stock, stock_critico, es_por_peso, precio_kg_bs, precio_kg_usd, stock_kg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.sku, data.nombre,
        data.p_compra_bs ?? 0, data.p_compra_usd ?? 0,
        data.p_venta_bs ?? 0, data.p_venta_usd ?? 0,
        data.stock, data.stock_critico,
        data.es_por_peso ? 1 : 0,
        data.precio_kg_bs ?? 0, data.precio_kg_usd ?? 0,
        data.stock_kg ?? 0
      ]
    );
  }

  static editar_producto(data) {
    const transaccionEditar = this.db.transaction(() => {
      let oldPrecioKgUsd = 0;
      if (data.es_por_peso) {
        const oldProd = this.db.prepare("SELECT precio_kg_usd FROM productos WHERE id = ?").get(data.id);
        oldPrecioKgUsd = oldProd ? parseFloat(oldProd.precio_kg_usd) : 0;
      }

      this.db.prepare(`
        UPDATE productos SET sku=?, nombre=?, p_compra_bs=?, p_compra_usd=?,
        p_venta_bs=?, p_venta_usd=?, stock=?, stock_critico=?,
        es_por_peso=?, precio_kg_bs=?, precio_kg_usd=?, stock_kg=?
        WHERE id=?
      `).run(
        data.sku, data.nombre,
        data.p_compra_bs ?? 0, data.p_compra_usd ?? 0,
        data.p_venta_bs ?? 0, data.p_venta_usd ?? 0,
        data.stock, data.stock_critico,
        data.es_por_peso ? 1 : 0,
        data.precio_kg_bs ?? 0, data.precio_kg_usd ?? 0,
        data.stock_kg ?? 0,
        data.id
      );

      if (!data.es_por_peso) {
        const detallesAfectados = this.db.prepare(`
          SELECT fd.id as detalle_id, fd.fiado_id, f.tasa_momento
          FROM fiados_detalle fd JOIN fiados f ON fd.fiado_id = f.id
          WHERE fd.producto_id = ? AND fd.pagado = 0 AND f.pagado = 0
        `).all(data.id);
        if (detallesAfectados.length > 0) {
          const stmtUpdateDetalle = this.db.prepare("UPDATE fiados_detalle SET precio_unitario = ?, nombre_prod = ? WHERE id = ?");
          const stmtUpdateFiadoTotal = this.db.prepare(`UPDATE fiados SET total_bs = (SELECT SUM(cantidad * precio_unitario) FROM fiados_detalle WHERE fiado_id = ?) WHERE id = ?`);
          const fiadosARecalcular = new Set();
          for (const det of detallesAfectados) {
            let tasa = parseFloat(det.tasa_momento) || parseFloat(this.obtener_config("tasa_usd"));
            stmtUpdateDetalle.run(parseFloat((data.p_venta_usd * tasa).toFixed(2)), data.nombre, det.detalle_id);
            fiadosARecalcular.add(det.fiado_id);
          }
          for (const fiado_id of fiadosARecalcular) {
            stmtUpdateFiadoTotal.run(fiado_id, fiado_id);
          }
        }
      } else {
        const detallesAfectados = this.db.prepare(`
          SELECT fd.id as detalle_id, fd.fiado_id, f.tasa_momento
          FROM fiados_detalle fd JOIN fiados f ON fd.fiado_id = f.id
          WHERE fd.producto_id = ? AND fd.pagado = 0 AND f.pagado = 0
        `).all(data.id);
        if (detallesAfectados.length > 0) {
          const stmtUpdateDetalle = this.db.prepare("UPDATE fiados_detalle SET precio_unitario = ?, nombre_prod = ? WHERE id = ?");
          const stmtUpdateFiadoTotal = this.db.prepare(`UPDATE fiados SET total_bs = (SELECT SUM(cantidad * precio_unitario) FROM fiados_detalle WHERE fiado_id = ?) WHERE id = ?`);
          const fiadosARecalcular = new Set();
          for (const det of detallesAfectados) {
            const tasa = parseFloat(det.tasa_momento) || parseFloat(this.obtener_config("tasa_usd"));
            const nuevoPrecioUnitario = round2(parseFloat(data.precio_kg_usd) * tasa);
            stmtUpdateDetalle.run(nuevoPrecioUnitario, data.nombre, det.detalle_id);
            fiadosARecalcular.add(det.fiado_id);
          }
          for (const fiado_id of fiadosARecalcular) {
            stmtUpdateFiadoTotal.run(fiado_id, fiado_id);
          }
        }
      }
    });
    transaccionEditar();
    return true;
  }

  static eliminar_producto(id) {
    this.db.prepare("DELETE FROM productos WHERE id=?").run(id);
    return true;
  }

  static asegurar_cliente(nombre, forzar_nuevo = true, telefono = 'S/D') {
    if (!nombre) return "CLIENTE EVENTUAL";
    const nombre_input = nombre.trim().toUpperCase();
    const tel_final = telefono ? telefono.trim() : 'S/D';
    if (["MOSTRADOR", "CLIENTE EVENTUAL", "S/D", "ANÓNIMO"].includes(nombre_input)) {
      if (!this.db.prepare("SELECT id FROM clientes WHERE nombre = 'CLIENTE EVENTUAL'").get()) {
        this.db.prepare("INSERT INTO clientes (nombre, rif, telefono) VALUES ('CLIENTE EVENTUAL', 'S/D', 'S/D')").run();
      }
      return "CLIENTE EVENTUAL";
    }
    const match = nombre_input.match(/^(.*?)\s\d+$/);
    const nombre_base = match ? match[1] : nombre_input;
    const coincidencias = this.db.prepare("SELECT nombre, telefono FROM clientes WHERE nombre = ? OR nombre LIKE ?").all(nombre_base, `${nombre_base} %`);
    const nombres_coincidentes = coincidencias.map(r => r.nombre);
    if (!forzar_nuevo && nombres_coincidentes.includes(nombre_input)) {
      if (tel_final !== 'S/D') {
        const cliente_db = coincidencias.find(c => c.nombre === nombre_input);
        if (cliente_db && (!cliente_db.telefono || cliente_db.telefono === 'S/D')) {
          this.db.prepare("UPDATE clientes SET telefono = ? WHERE nombre = ?").run(tel_final, nombre_input);
        }
      }
      return nombre_input;
    }
    if (nombres_coincidentes.length === 0) {
      this.db.prepare("INSERT INTO clientes (nombre, rif, telefono) VALUES (?, 'S/D', ?)").run(nombre_base, tel_final);
      return nombre_base;
    } else {
      let max_num = 1;
      for (const nom of nombres_coincidentes) {
        const partes = nom.split(' ');
        if (partes.length > 1 && /^\d+$/.test(partes[partes.length - 1])) max_num = Math.max(max_num, parseInt(partes[partes.length - 1]));
      }
      const nombre_final = `${nombre_base} ${max_num + 1}`;
      this.db.prepare("INSERT INTO clientes (nombre, rif, telefono) VALUES (?, 'S/D', ?)").run(nombre_final, tel_final);
      return nombre_final;
    }
  }

  static registrar_venta_completa(cliente, total_bs, total_usd, metodo, descuento, items, es_seleccionado = false, telefono = 'S/D', deducirStock = true, monto_recibido = null, vuelto = null, vuelto_entregado = false, vuelto_metodo = null) {
    let cliente_final;
    const transaccionVenta = this.db.transaction(() => {
      const fecha = this._nowStr();
      const cliente_input = cliente ? cliente.trim().toUpperCase() : "MOSTRADOR";
      const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
      cliente_final = this.asegurar_cliente(cliente_input, !es_seleccionado, telefono);
      this.db.prepare(`INSERT INTO ventas (fecha, total_bs, total_usd, metodo, descuento, cliente, tasa_momento, monto_recibido, vuelto, vuelto_entregado, vuelto_metodo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(fecha, total_bs, total_usd, metodo, descuento, cliente_final, tasa_actual, monto_recibido, vuelto, vuelto_entregado ? 1 : 0, vuelto_metodo);
      const venta_id = this.db.prepare("SELECT last_insert_rowid() as id").get().id;
      if (vuelto_entregado && vuelto && vuelto > 0 && vuelto_metodo) {
        const vueltoUsd = vuelto / tasa_actual;   // ← CORREGIDO (sin round2)
        const descGasto = `Vuelto entregado en venta #${venta_id} - ${cliente_final}`;
        this.db.prepare(`INSERT INTO gastos (fecha, descripcion, monto_bs, monto_usd, metodo) VALUES (?, ?, ?, ?, ?)`)
          .run(fecha, descGasto, vuelto, vueltoUsd, vuelto_metodo);
      }
      const stmtDetalle = this.db.prepare(`INSERT INTO ventas_detalle (venta_id, producto, cantidad, precio_unitario, fiado_detalle_id) VALUES (?, ?, ?, ?, ?)`);
      for (const item of items) {
        if (deducirStock) {
          this._descontarStock(item);
        }
        const cantidad = item.es_por_peso ? item.peso_kg : item.cant;
        const precioUnitario = item.es_por_peso ? item.precio_kg_bs : item.precio_bs;
        stmtDetalle.run(venta_id, item.nombre, cantidad, precioUnitario, item.fiado_detalle_id || null);
      }
      if (metodo && metodo.includes('Abono') && !metodo.includes('Pago Fiado') && !metodo.includes('Cobro Fiado')) {
        const fiadoIdsActualizar = new Set();
        for (const item of items) {
          if (item.fiado_detalle_id) {
            const fDet = this.db.prepare("SELECT cantidad, fiado_id FROM fiados_detalle WHERE id = ?").get(item.fiado_detalle_id);
            if (fDet) {
              const cantidadAbonar = item.es_por_peso ? item.peso_kg : item.cant;
              const nuevaCantidad = fDet.cantidad - cantidadAbonar;
              if (nuevaCantidad <= 0) {
                this.db.prepare("UPDATE fiados_detalle SET cantidad = 0, pagado = 1 WHERE id = ?").run(item.fiado_detalle_id);
              } else {
                this.db.prepare("UPDATE fiados_detalle SET cantidad = ? WHERE id = ?").run(nuevaCantidad, item.fiado_detalle_id);
              }
              fiadoIdsActualizar.add(fDet.fiado_id);
            }
          }
        }
        for (const fiadoId of fiadoIdsActualizar) {
          this.db.prepare(`UPDATE fiados SET total_bs = (SELECT SUM(cantidad * precio_unitario) FROM fiados_detalle WHERE fiado_id = ?) WHERE id = ?`).run(fiadoId, fiadoId);
          const pendientes = this.db.prepare("SELECT COUNT(*) as count FROM fiados_detalle WHERE fiado_id = ? AND cantidad > 0").get(fiadoId);
          if (pendientes.count === 0) {
            this.db.prepare("UPDATE fiados SET pagado = 1 WHERE id = ?").run(fiadoId);
          }
        }
      }
    });
    transaccionVenta();
    return cliente_final;
  }

  static registrar_fiado_completo(cliente, total_bs, items, es_seleccionado = false, telefono = 'S/D') {
    const transaccionFiado = this.db.transaction(() => {
      const fecha = this._nowStr();
      const cliente_input = cliente ? cliente.trim().toUpperCase() : "";
      const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
      const cliente_final = this.asegurar_cliente(cliente_input, !es_seleccionado, telefono);
      this.db.prepare(`INSERT INTO fiados (cliente, fecha, total_bs, pagado, tasa_momento) VALUES (?, ?, ?, 0, ?)`).run(cliente_final, fecha, total_bs, tasa_actual);
      const fiado_id = this.db.prepare("SELECT last_insert_rowid() as id").get().id;
      const fecha_agregado = this._nowStr();
      const stmtDetalle = this.db.prepare(`INSERT INTO fiados_detalle (fiado_id, producto_id, nombre_prod, cantidad, precio_unitario, pagado, fecha_agregado) VALUES (?, ?, ?, ?, ?, 0, ?)`);
      for (const item of items) {
        this._descontarStock(item);
        const cant = item.es_por_peso ? item.peso_kg : item.cant;
        const precio_unit = item.es_por_peso ? item.precio_kg_bs : item.precio_bs;
        stmtDetalle.run(fiado_id, item.id, item.nombre, cant, precio_unit, fecha_agregado);
      }
    });
    transaccionFiado();
    return true;
  }

  static get_detalle_fiado(fiado_id) {
    return this.db.prepare("SELECT id, producto_id, nombre_prod, cantidad, precio_unitario, pagado, fecha_agregado FROM fiados_detalle WHERE fiado_id = ?").all(fiado_id);
  }

  static agregar_producto_a_fiado(fiado_id, producto_id, cantidad, precio_unitario) {
    const transaccion = this.db.transaction(() => {
      const producto = this.db.prepare("SELECT stock, es_por_peso, stock_kg FROM productos WHERE id = ?").get(producto_id);
      
      if (producto.es_por_peso) {
        if (!producto || producto.stock_kg < cantidad) {
          const disponible = producto ? producto.stock_kg.toFixed(3) : '0.000';
          throw new Error(`Stock insuficiente: solo quedan ${disponible} kg`);
        }
        const result = this.db.prepare("UPDATE productos SET stock_kg = stock_kg - ? WHERE id = ? AND stock_kg >= ?")
                           .run(cantidad, producto_id, cantidad);
        if (result.changes === 0) {
          const disponible = producto ? producto.stock_kg.toFixed(3) : '0.000';
          throw new Error(`No se pudo descontar stock. Stock actual: ${disponible} kg`);
        }
      } else {
        const stockActual = this.db.prepare("SELECT stock FROM productos WHERE id = ?").get(producto_id);
        if (!stockActual || stockActual.stock < cantidad) {
          const disponible = stockActual ? stockActual.stock : 0;
          throw new Error(`Stock insuficiente: solo quedan ${disponible} unidades`);
        }
        const result = this.db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?")
                           .run(cantidad, producto_id, cantidad);
        if (result.changes === 0) {
          const disponible = stockActual ? stockActual.stock : 0;
          throw new Error(`No se pudo descontar stock. Stock actual: ${disponible} unidades`);
        }
      }

      const fecha_agregado = this._nowStr();
      const cant = producto.es_por_peso ? cantidad : cantidad;
      const precio = producto.es_por_peso ? round2(precio_unitario / cantidad) : precio_unitario;
      this.db.prepare(`INSERT INTO fiados_detalle (fiado_id, producto_id, nombre_prod, cantidad, precio_unitario, fecha_agregado) VALUES (?, ?, (SELECT nombre FROM productos WHERE id = ?), ?, ?, ?)`)
        .run(fiado_id, producto_id, producto_id, cant, precio, fecha_agregado);
      
      this.db.prepare(`UPDATE fiados SET total_bs = (SELECT SUM(cantidad * precio_unitario) FROM fiados_detalle WHERE fiado_id = ?) WHERE id = ?`)
        .run(fiado_id, fiado_id);
    });
    transaccion();
    return true;
  }

  static actualizar_cantidad_fiado(detalle_id, fiado_id, nueva_cantidad) {
    const transaccion = this.db.transaction(() => {
      const item = this.db.prepare("SELECT producto_id, cantidad FROM fiados_detalle WHERE id = ?").get(detalle_id);
      if (!item) return;
      const diff = nueva_cantidad - item.cantidad;
      if (diff > 0) {
        const stockActual = this.db.prepare("SELECT stock FROM productos WHERE id = ?").get(item.producto_id);
        if (!stockActual || stockActual.stock < diff) {
          throw new Error(`Stock insuficiente para aumentar cantidad`);
        }
        const result = this.db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?").run(diff, item.producto_id, diff);
        if (result.changes === 0) {
          throw new Error(`No se pudo descontar stock`);
        }
      } else if (diff < 0) {
        this.db.prepare("UPDATE productos SET stock = stock + ? WHERE id = ?").run(-diff, item.producto_id);
      }
      this.db.prepare("UPDATE fiados_detalle SET cantidad = ? WHERE id = ?").run(nueva_cantidad, detalle_id);
      this.db.prepare(`UPDATE fiados SET total_bs = (SELECT SUM(cantidad * precio_unitario) FROM fiados_detalle WHERE fiado_id = ?) WHERE id = ?`).run(fiado_id, fiado_id);
    });
    transaccion();
    return true;
  }

  static get_abonos_fiado(fiado_id) {
    return this.db.prepare(`
      SELECT v.fecha, v.total_bs as monto, v.total_usd as monto_usd, v.metodo, v.tasa_momento,
      v.monto_recibido, v.vuelto, v.vuelto_entregado, v.vuelto_metodo, v.monto_esperado_bs, v.monto_esperado_usd,
      COALESCE((SELECT group_concat(producto || ' (x' || cantidad || ')', ', ') FROM ventas_detalle WHERE venta_id = v.id), 'Abono/Cargo General') as descripcion
      FROM ventas v WHERE v.fiado_id = ? ORDER BY v.fecha DESC
    `).all(fiado_id);
  }

  static agregar_cargo_adicional_fiado(fiado_id, monto_bs, descripcion) {
    const transaccion = this.db.transaction(() => {
      const fecha_agregado = this._nowStr();
      this.db.prepare(`INSERT INTO fiados_detalle (fiado_id, producto_id, nombre_prod, cantidad, precio_unitario, pagado, fecha_agregado) VALUES (?, 0, ?, 1, ?, 0, ?)`).run(fiado_id, descripcion, monto_bs, fecha_agregado);
      this.db.prepare(`UPDATE fiados SET total_bs = (SELECT SUM(cantidad * precio_unitario) FROM fiados_detalle WHERE fiado_id = ?) WHERE id = ?`).run(fiado_id, fiado_id);
    });
    transaccion();
    return true;
  }

  static eliminar_detalle_fiado(detalle_id, fiado_id) {
    const transaccion = this.db.transaction(() => {
      this.db.prepare("DELETE FROM fiados_detalle WHERE id = ?").run(detalle_id);
      this.db.prepare(`UPDATE fiados SET total_bs = COALESCE((SELECT SUM(cantidad * precio_unitario) FROM fiados_detalle WHERE fiado_id = ?), 0) WHERE id = ?`).run(fiado_id, fiado_id);
      if (this.db.prepare("SELECT COUNT(*) as count FROM fiados_detalle WHERE fiado_id = ?").get(fiado_id).count === 0) {
        this.db.prepare("UPDATE fiados SET pagado = 1 WHERE id = ?").run(fiado_id);
      }
    });
    transaccion();
    return true;
  }

  static obtener_productos_criticos() {
    return this.db.prepare(`
        SELECT nombre, stock, stock_critico, es_por_peso, stock_kg 
        FROM productos 
        WHERE (es_por_peso = 0 AND stock <= stock_critico) 
           OR (es_por_peso = 1 AND stock_kg <= stock_critico)
    `).all();
  }

  static get_ventas_hoy() {
    const offset = new Date().getTimezoneOffset() * 60000;
    const res = this.db.prepare("SELECT SUM(total_bs) as total FROM ventas WHERE fecha LIKE ?").get(new Date(Date.now() - offset).toISOString().slice(0, 10) + '%');
    return res?.total || 0.0;
  }

  static get_count_stock_bajo() {
    return this.db.prepare("SELECT COUNT(*) as total FROM productos WHERE (es_por_peso = 0 AND stock <= stock_critico) OR (es_por_peso = 1 AND stock_kg <= stock_critico)").get().total;
  }

  static get_count_clientes() {
    return this.db.prepare("SELECT COUNT(*) as total FROM clientes").get().total;
  }

  static get_fiados_pendientes() {
    return this.db.prepare("SELECT COUNT(DISTINCT f.id) as total FROM fiados f INNER JOIN fiados_detalle fd ON fd.fiado_id = f.id WHERE f.pagado = 0 AND fd.cantidad > 0").get().total || 0;
  }

  static get_datos_grafico() {
    return this.db.prepare(`SELECT dia, SUM(total_bs) as total FROM (SELECT strftime('%d/%m', fecha) as dia, total_bs, fecha FROM ventas ORDER BY fecha DESC LIMIT 100) GROUP BY dia ORDER BY fecha ASC LIMIT 7`).all();
  }

  static registrar_pago_fiado_como_venta(fiado_id, cliente, metodo_pago = "Efectivo Bs", total_bs_override = null, total_usd_override = null, monto_recibido = null, vuelto = null, vuelto_entregado = false, vuelto_metodo = null, monto_esperado_bs = null, monto_esperado_usd = null) {
    const transaccion = this.db.transaction(() => {
      const fecha = this._nowStr();
      const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
      const fiado = this.db.prepare("SELECT total_bs, tasa_momento FROM fiados WHERE id = ?").get(fiado_id);
      if (!fiado) throw new Error();
      const tasa_orig = (fiado.tasa_momento && parseFloat(fiado.tasa_momento) > 0) ? parseFloat(fiado.tasa_momento) : tasa_actual;
      const monto_usd_original = round2(fiado.total_bs / tasa_orig);
      const esExtranjero = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'].includes(metodo_pago);
      const esMixto = metodo_pago.includes('Mixto');

      let total_bs_final, total_usd_final;
      if (esMixto && total_bs_override !== null && total_usd_override !== null) {
        total_bs_final = total_bs_override;
        total_usd_final = total_usd_override;
      } else if (esExtranjero) {
        total_usd_final = (total_usd_override != null) ? total_usd_override : monto_usd_original;
        total_bs_final = 0;
      } else {
        total_bs_final = (total_bs_override != null) ? total_bs_override : round2(monto_usd_original * tasa_actual);
        total_usd_final = 0;
      }

      this.db.prepare(`INSERT INTO ventas (fecha, total_bs, total_usd, metodo, descuento, cliente, fiado_id, tasa_momento, monto_recibido, vuelto, vuelto_entregado, vuelto_metodo, monto_esperado_bs, monto_esperado_usd) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(fecha, total_bs_final, total_usd_final, `Pago Fiado: ${metodo_pago}`, cliente ? cliente.trim().toUpperCase() : "", fiado_id, tasa_actual, monto_recibido, vuelto, vuelto_entregado ? 1 : 0, vuelto_metodo, monto_esperado_bs, monto_esperado_usd);

      const nueva_venta_id = this.db.prepare("SELECT last_insert_rowid() as id").get().id;
      const detalles = this.db.prepare("SELECT id, nombre_prod, cantidad, precio_unitario FROM fiados_detalle WHERE fiado_id = ? AND cantidad > 0").all(fiado_id);
      const stmtDetalle = this.db.prepare(`INSERT INTO ventas_detalle (venta_id, producto, cantidad, precio_unitario, fiado_detalle_id) VALUES (?, ?, ?, ?, ?)`);
      for (const det of detalles) {
        const precio_bs = round2((det.precio_unitario / tasa_orig) * tasa_actual);
        stmtDetalle.run(nueva_venta_id, det.nombre_prod, det.cantidad, precio_bs, det.id);
      }
      if (!esMixto) {
        this.db.prepare(`UPDATE fiados SET pagado = 1, total_bs = 0 WHERE id = ?`).run(fiado_id);
        this.db.prepare("UPDATE fiados_detalle SET cantidad = 0, pagado = 1 WHERE fiado_id = ?").run(fiado_id);
      }
    });
    transaccion();
    return true;
  }

  static registrar_abono_multiple(fiado_id, items, metodo_pago, total_bs, total_usd, monto_recibido = null, vuelto = null, vuelto_entregado = false, vuelto_metodo = null, cliente = null, monto_esperado_bs = null, monto_esperado_usd = null) {
    const transaccion = this.db.transaction(() => {
      const fecha = this._nowStr();
      const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
      const fiado = this.db.prepare("SELECT tasa_momento, cliente FROM fiados WHERE id = ?").get(fiado_id);
      if (!fiado) throw new Error("Fiado no encontrado");

      const cliente_final = cliente ? cliente.trim().toUpperCase() : (fiado.cliente || "");
      this.db.prepare(`INSERT INTO ventas (fecha, total_bs, total_usd, metodo, descuento, cliente, fiado_id, tasa_momento, monto_recibido, vuelto, vuelto_entregado, vuelto_metodo, monto_esperado_bs, monto_esperado_usd) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(fecha, total_bs, total_usd, `Abono Fiado: ${metodo_pago}`, cliente_final, fiado_id, tasa_actual, monto_recibido, vuelto, vuelto_entregado ? 1 : 0, vuelto_metodo, monto_esperado_bs, monto_esperado_usd);

      const venta_id = this.db.prepare("SELECT last_insert_rowid() as id").get().id;

      const stmtDetalle = this.db.prepare(`INSERT INTO ventas_detalle (venta_id, producto, cantidad, precio_unitario, fiado_detalle_id) VALUES (?, ?, ?, ?, ?)`);
      for (const item of items) {
        const { detalle_id, cantidad, precio_unitario_bs } = item;
        const f_det = this.db.prepare("SELECT nombre_prod, cantidad FROM fiados_detalle WHERE id = ?").get(detalle_id);
        if (!f_det) throw new Error(`Detalle ${detalle_id} no encontrado`);
        if (cantidad > f_det.cantidad) throw new Error(`Cantidad excede lo pendiente para ${f_det.nombre_prod}`);

        stmtDetalle.run(venta_id, f_det.nombre_prod, cantidad, precio_unitario_bs, detalle_id);

        const nuevaCantidad = f_det.cantidad - cantidad;
        if (nuevaCantidad <= 0) {
          this.db.prepare("UPDATE fiados_detalle SET cantidad = 0, pagado = 1 WHERE id = ?").run(detalle_id);
        } else {
          this.db.prepare("UPDATE fiados_detalle SET cantidad = ? WHERE id = ?").run(nuevaCantidad, detalle_id);
        }
      }

      this.db.prepare("UPDATE fiados SET total_bs = total_bs - ? WHERE id = ?").run(total_bs, fiado_id);

      const pendientes = this.db.prepare("SELECT COUNT(*) as count FROM fiados_detalle WHERE fiado_id = ? AND cantidad > 0").get(fiado_id);
      if (pendientes.count === 0) {
        this.db.prepare("UPDATE fiados SET pagado = 1 WHERE id = ?").run(fiado_id);
      }
    });
    transaccion();
    return true;
  }

  static finalizar_fiado_pagado(fiado_id) {
    this.db.prepare("UPDATE fiados SET pagado = 1, total_bs = 0 WHERE id = ?").run(fiado_id);
    this.db.prepare("UPDATE fiados_detalle SET cantidad = 0, pagado = 1 WHERE fiado_id = ?").run(fiado_id);
    return true;
  }

  static editar_cliente(id, nombre_viejo, nombre_nuevo, telefono_nuevo) {
    const nombre_norm = nombre_nuevo.trim().toUpperCase();
    const existe = this.db.prepare("SELECT id FROM clientes WHERE nombre = ? AND id != ?").get(nombre_norm, id);
    if (existe) throw new Error("Ese nombre ya está registrado en otro cliente, elige uno diferente.");
    const transaccion = this.db.transaction(() => {
      this.db.prepare("UPDATE clientes SET nombre = ?, telefono = ? WHERE id = ?").run(nombre_norm, telefono_nuevo.trim(), id);
      if (nombre_viejo !== nombre_norm) {
        this.db.prepare("UPDATE ventas SET cliente = ? WHERE cliente = ?").run(nombre_norm, nombre_viejo);
        this.db.prepare("UPDATE fiados SET cliente = ? WHERE cliente = ?").run(nombre_norm, nombre_viejo);
      }
    });
    transaccion();
    return true;
  }

  static obtener_compras_cliente(nombre_cliente) {
    const nombre_norm = nombre_cliente ? nombre_cliente.trim().toUpperCase() : "";
    const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
    const ventas = this.db.prepare(`
      SELECT v.id, v.fecha, v.total_bs, v.total_usd, v.metodo, COALESCE(v.tasa_momento, 0.0) as tasa_momento, v.monto_recibido, v.vuelto, v.vuelto_entregado, v.vuelto_metodo,
      (SELECT group_concat(vd.producto || '|' || vd.cantidad || '|' || vd.precio_unitario || '|' || round(vd.precio_unitario / COALESCE(NULLIF(v.tasa_momento, 0), 1.0), 2), ';;') FROM ventas_detalle vd WHERE vd.venta_id = v.id) as detalle_productos,
      v.fiado_id
      FROM ventas v WHERE UPPER(v.cliente) = ? ORDER BY v.fecha DESC LIMIT 30
    `).all(nombre_norm);

    const ventasNormales = ventas.filter(v => !v.fiado_id || v.fiado_id === 0);
    const abonosYpagos = ventas.filter(v => v.fiado_id && v.fiado_id > 0);

    const fiadosRaw = this.db.prepare(`
      SELECT f.id, f.fecha, f.tasa_momento, f.total_bs as total_bs_original,
      (SELECT group_concat(fd.id || '|' || fd.nombre_prod || '|' || fd.cantidad || '|' || fd.precio_unitario || '|' || fd.producto_id || '|' || fd.pagado, ';;') FROM fiados_detalle fd WHERE fd.fiado_id = f.id ORDER BY fd.id ASC) as detalle_productos
      FROM fiados f WHERE UPPER(f.cliente) = ? AND f.pagado = 0 ORDER BY f.fecha DESC
    `).all(nombre_norm);

    const fiados = fiadosRaw.map(f => {
      const tasaOrig = (f.tasa_momento && parseFloat(f.tasa_momento) > 0) ? parseFloat(f.tasa_momento) : tasa_actual;
      const detalles = (f.detalle_productos || '').split(';;').filter(d => d).map(d => {
        const partes = d.split('|');
        return {
          detalleId: parseInt(partes[0]) || 0,
          nombre: partes[1] || '',
          cantidad: parseFloat(partes[2]) || 0,
          precioUnitario: parseFloat(partes[3]) || 0,
          productoId: parseInt(partes[4]) || 0,
          pagado: parseInt(partes[5]) || 0
        };
      });

      const abonosPorDetalle = {};
      const abonosRows = this.db.prepare(`
        SELECT vd.fiado_detalle_id, SUM(vd.cantidad) as total
        FROM ventas_detalle vd
        JOIN ventas v ON vd.venta_id = v.id
        WHERE v.fiado_id = ? AND v.metodo LIKE '%Abono%' AND vd.fiado_detalle_id IS NOT NULL
        GROUP BY vd.fiado_detalle_id
      `).all(f.id);
      abonosRows.forEach(row => {
        abonosPorDetalle[row.fiado_detalle_id] = row.total;
      });

      const detallesFinal = detalles.map(d => {
        const precioUsd = tasaOrig > 0 ? round2(d.precioUnitario / tasaOrig) : 0;
        const precioBsActual = round2(precioUsd * tasa_actual);
        const cantidadAbonada = (!d.nombre.toUpperCase().includes('CARGO ADICIONAL'))
          ? (abonosPorDetalle[d.detalleId] || 0)
          : 0;
        const cantidadOriginal = d.cantidad + cantidadAbonada;
        const estado = cantidadAbonada > 0 ? 'ABONADO' : 'PENDIENTE';
        return {
          detalleId: d.detalleId,
          nombre: d.nombre,
          cantidad: d.cantidad,
          cantidadOriginal,
          cantidadAbonada,
          precioUnitario: d.precioUnitario,
          precioUsd,
          precioBsActual,
          estado
        };
      });

      const totalBs = round2(
        detallesFinal
          .filter(d => d.cantidad > 0)
          .reduce((sum, d) => sum + (d.cantidad * d.precioUsd), 0) * tasa_actual
      );
      const totalUsd = detallesFinal
        .filter(d => d.cantidad > 0)
        .reduce((sum, d) => round2(sum + (d.cantidad * d.precioUsd)), 0);

      const detalleStr = detallesFinal.map(d => {
          return `${d.nombre}|${d.cantidad}|${d.precioBsActual}|${d.precioUsd}|${d.cantidadAbonada}|${d.estado}`;
      }).join(';;');

      return {
        id: f.id,
        fecha: f.fecha,
        total_bs: totalBs,
        total_usd: totalUsd,
        metodo: 'PENDIENTE (FIADO)',
        tasa_momento: 0.0,
        detalle_productos: detalleStr,
        esFiado: true
      };
    });

    const abonosProcesados = abonosYpagos.map(v => {
      let metodoLimpio = v.metodo;
      if (v.metodo.includes('Abono Fiado:')) {
        metodoLimpio = '💳 Abono Fiado - ' + v.metodo.replace('Abono Fiado: ', '').trim();
      } else if (v.metodo.includes('Pago Fiado:') || v.metodo.includes('Cobro Fiado:')) {
        metodoLimpio = '✅ Pago Fiado - ' + v.metodo.replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '').trim();
      }

      if (v.fiado_id && (v.metodo.includes('Pago Fiado') || v.metodo.includes('Cobro Fiado'))) {
        const detallesRaw = (v.detalle_productos || '').split(';;').filter(d => d).map(d => {
          const partes = d.split('|');
          return {
            nombre: partes[0] || '',
            cantidad: parseFloat(partes[1]) || 0,
            precioBs: parseFloat(partes[2]) || 0,
            precioUsd: parseFloat(partes[3]) || 0
          };
        });

        const detallesEnriquecidos = detallesRaw.map(det => {
          const ventaDetalleRow = this.db.prepare(`
            SELECT fiado_detalle_id FROM ventas_detalle WHERE venta_id = ? AND producto = ? LIMIT 1
          `).get(v.id, det.nombre);

          const fiadoDetId = ventaDetalleRow ? ventaDetalleRow.fiado_detalle_id : null;
          let cantidadOriginal = det.cantidad;
          let estado = 'PAGADO';
          let totalAbonado = 0;

          if (fiadoDetId) {
            const abonosPrevios = this.db.prepare(`
              SELECT COALESCE(SUM(vd.cantidad), 0) as total
              FROM ventas_detalle vd
              JOIN ventas v2 ON vd.venta_id = v2.id
              WHERE v2.fiado_id = ? AND vd.fiado_detalle_id = ? AND v2.metodo LIKE '%Abono%' AND v2.id != ?
            `).get(v.fiado_id, fiadoDetId, v.id);

            totalAbonado = abonosPrevios?.total || 0;
            cantidadOriginal = det.cantidad + totalAbonado;
            if (totalAbonado > 0) {
              estado = 'ABONADO';
            }
          }
          return {
            ...det,
            cantidadOriginal,
            totalAbonado,
            estado
          };
        });

        const detallesAbonados = this.db.prepare(`
          SELECT fd.id, fd.nombre_prod, fd.precio_unitario, fd.producto_id
          FROM fiados_detalle fd
          WHERE fd.fiado_id = ? AND fd.cantidad = 0 AND fd.pagado = 1
        `).all(v.fiado_id);

        const tasaOrig = (() => {
          const fiadoInfo = this.db.prepare("SELECT tasa_momento FROM fiados WHERE id = ?").get(v.fiado_id);
          return (fiadoInfo && fiadoInfo.tasa_momento && parseFloat(fiadoInfo.tasa_momento) > 0) ? parseFloat(fiadoInfo.tasa_momento) : tasa_actual;
        })();

        detallesAbonados.forEach(dAb => {
          const abonoPrev = this.db.prepare(`
            SELECT COALESCE(SUM(vd.cantidad), 0) as total
            FROM ventas_detalle vd
            JOIN ventas v2 ON vd.venta_id = v2.id
            WHERE v2.fiado_id = ? AND vd.fiado_detalle_id = ? AND v2.metodo LIKE '%Abono%'
          `).get(v.fiado_id, dAb.id);

          const totalAbonado = abonoPrev?.total || 0;
          if (totalAbonado > 0) {
            let precioUsd = 0;
            if (dAb.producto_id > 0) {
              const prod = this.db.prepare("SELECT p_venta_usd, es_por_peso, precio_kg_usd FROM productos WHERE id = ?").get(dAb.producto_id);
              if (prod) {
                if (prod.es_por_peso) {
                  precioUsd = parseFloat(prod.precio_kg_usd || 0);
                } else {
                  precioUsd = parseFloat(prod.p_venta_usd || 0);
                }
              } else {
                precioUsd = tasaOrig > 0 ? round2(dAb.precio_unitario / tasaOrig) : 0;
              }
            } else {
              precioUsd = tasaOrig > 0 ? round2(dAb.precio_unitario / tasaOrig) : 0;
            }
            const precioBsActual = round2(precioUsd * tasa_actual);
            const yaExiste = detallesEnriquecidos.some(d => d.nombre === dAb.nombre_prod && d.estado === 'ABONADO');
            if (!yaExiste) {
              detallesEnriquecidos.push({
                nombre: dAb.nombre_prod,
                cantidad: 0,
                cantidadOriginal: totalAbonado,
                precioBs: precioBsActual,
                precioUsd: precioUsd,
                totalAbonado: totalAbonado,
                estado: 'ABONADO'
              });
            }
          }
        });

        const detalleStrNuevo = detallesEnriquecidos.map(d => {
          return `${d.nombre}|${d.cantidad}|${d.precioBs}|${d.precioUsd}|${d.totalAbonado}|${d.estado}`;
        }).join(';;');

        return { ...v, metodo: metodoLimpio, esAbono: true, detalle_productos: detalleStrNuevo };
      }
      return { ...v, metodo: metodoLimpio, esAbono: true };
    });

    const resultado = [
      ...ventasNormales.slice(0, 10),
      ...abonosProcesados,
      ...fiados
    ].sort((a, b) => {
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return b.fecha.localeCompare(a.fecha);
    });

    return resultado;
  }

  static eliminar_cliente(cliente_id) {
    this.db.prepare("DELETE FROM clientes WHERE id = ?").run(cliente_id);
    return true;
  }

  static obtener_nombres_clientes() {
    return this.db.prepare("SELECT nombre, telefono FROM clientes ORDER BY nombre ASC").all();
  }

  static agregar_cliente_manual(nombre, telefono) {
    this.asegurar_cliente(nombre.trim().toUpperCase(), true, telefono ? telefono.trim() : 'S/D');
    return true;
  }

  static actualizar_tasa_y_precios(nueva_tasa, esManual = false) {
    const transaccion = this.db.transaction(() => {
      this.db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'tasa_usd'").run(String(nueva_tasa));
      const modo = esManual ? 'Manual' : 'Automático (BCV)';
      this.db.prepare("INSERT OR REPLACE INTO configuracion VALUES ('modo_tasa', ?)").run(modo);
      this.db.prepare("UPDATE productos SET p_venta_bs = p_venta_usd * ?").run(nueva_tasa);
      this.db.prepare("UPDATE productos SET p_compra_bs = p_compra_usd * ?").run(nueva_tasa);
      this.db.prepare("UPDATE productos SET precio_kg_bs = precio_kg_usd * ?").run(nueva_tasa);
    });
    transaccion();
    return true;
  }

  static preparar_tablas_seguridad() {
    if (this.db.prepare("SELECT COUNT(*) as count FROM usuarios").get().count === 0) {
      this.db.prepare(`INSERT INTO usuarios (nombre, usuario, password, rol, permisos) VALUES ('Administrador', 'admin', ?, 'admin', 'todas')`).run(crypto.createHash('sha256').update("admin123").digest('hex'));
    }
  }

  static validar_login(usuario, password) {
    const user = this.db.prepare(`SELECT id, nombre, usuario, rol, permisos FROM usuarios WHERE usuario = ? AND password = ?`).get(usuario, crypto.createHash('sha256').update(password).digest('hex'));
    if (user) {
      this.db.prepare("UPDATE usuarios SET ultimo_login = ? WHERE id = ?").run(this._nowStr(), user.id);
      return user;
    }
    return null;
  }

  static obtener_usuarios() { return this.db.prepare("SELECT id, nombre, usuario, rol, permisos, ultimo_login FROM usuarios").all(); }

  static agregar_usuario(nombre, usuario, password, rol, permisos = 'todas') {
    this.db.prepare(`INSERT INTO usuarios (nombre, usuario, password, rol, permisos) VALUES (?, ?, ?, ?, ?)`).run(nombre, usuario, crypto.createHash('sha256').update(password).digest('hex'), rol, permisos);
    return true;
  }

  static eliminar_usuario(user_id) { this.db.prepare("DELETE FROM usuarios WHERE id = ? AND usuario != 'admin'").run(user_id); }

  static actualizar_perfil(user_id, nombre, usuario, password = null) {
    if (password) {
      this.db.prepare(`UPDATE usuarios SET nombre=?, usuario=?, password=? WHERE id=?`).run(nombre, usuario, crypto.createHash('sha256').update(password).digest('hex'), user_id);
    } else {
      this.db.prepare("UPDATE usuarios SET nombre=?, usuario=? WHERE id=?").run(nombre, usuario, user_id);
    }
    return true;
  }

  static obtener_dias_con_actividad() { return this.db.prepare("SELECT DISTINCT date(fecha) as dia FROM ventas ORDER BY dia DESC").all().map(r => r.dia); }

  static obtener_reporte_diario(fecha) {
    const ventasRaw = this.db.prepare(`SELECT v.id, v.cliente, (SELECT group_concat(producto || ' (x' || cantidad || ')', ', ') FROM ventas_detalle WHERE venta_id = v.id) as productos, v.total_bs, v.total_usd, v.metodo, v.tasa_momento, v.fecha FROM ventas v WHERE date(v.fecha) = ? AND (v.fiado_id IS NULL OR v.fiado_id = 0) ORDER BY v.fecha ASC`).all(fecha);
    const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
    const esMetodoExtranjero = (metodo) => {
      const extranjeros = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];
      return extranjeros.includes(metodo);
    };
    const ventasAgrupadas = [];
    const grupos = {};
    for (const v of ventasRaw) {
      const key = v.fecha + '|' + (v.cliente || '').toUpperCase();
      if (!grupos[key]) {
        grupos[key] = {
          id: v.id,
          cliente: v.cliente,
          fecha: v.fecha,
          total_bs: 0,
          total_usd: 0,
          metodos: [],
          tasa_momento: v.tasa_momento || tasa_actual,
          productos: v.productos
        };
      }
      const g = grupos[key];
      if (esMetodoExtranjero(v.metodo)) {
        g.total_usd += parseFloat(v.total_usd || 0);
      } else {
        g.total_bs += parseFloat(v.total_bs || 0);
      }
      g.metodos.push(v.metodo);
      if (!g.tasa_momento && v.tasa_momento) g.tasa_momento = v.tasa_momento;
    }
    for (const key in grupos) {
      const g = grupos[key];
      const metodosUnicos = [...new Set(g.metodos)];
      let metodoFinal;
      if (metodosUnicos.length === 1) {
        metodoFinal = metodosUnicos[0];
      } else {
        metodoFinal = 'Mixto: ' + metodosUnicos.join(' + ');
      }
      ventasAgrupadas.push({
        id: g.id,
        cliente: g.cliente,
        fecha: g.fecha,
        total_bs: round2(g.total_bs),
        total_usd: g.total_usd,
        metodo: metodoFinal,
        tasa_momento: g.tasa_momento,
        productos: g.productos
      });
    }
    const fiadosRaw = this.db.prepare(`SELECT f.id, f.cliente, f.fecha, f.pagado, f.tasa_momento, f.total_bs as total_bs_original FROM fiados f WHERE date(f.fecha) = ? OR f.pagado = 0`).all(fecha);
    const fiados = fiadosRaw.map(f => {
      const detalles = this.db.prepare(`SELECT id, nombre_prod, cantidad, pagado, precio_unitario, producto_id FROM fiados_detalle WHERE fiado_id = ?`).all(f.id);
      const tasaOrig = (f.tasa_momento && parseFloat(f.tasa_momento) > 0) ? parseFloat(f.tasa_momento) : tasa_actual;
      const tasaMostrar = f.pagado ? tasaOrig : tasa_actual;
      let totalBs = 0;
      let totalUsd = 0;
      const detallesEnriquecidos = [];
      let ventaPagoTotal = null;
      if (f.pagado) {
        ventaPagoTotal = this.db.prepare(`SELECT id FROM ventas WHERE fiado_id = ? AND (metodo LIKE '%Pago Fiado%' OR metodo LIKE '%Cobro Fiado%') ORDER BY fecha DESC LIMIT 1`).get(f.id);
      }
      const productos = detalles.map(d => {
        const nombre = d.nombre_prod;
        if (nombre.toUpperCase().includes('CARGO ADICIONAL')) {
          totalBs += d.cantidad * d.precio_unitario;
          totalUsd += tasaOrig > 0 ? round2((d.cantidad * d.precio_unitario) / tasaOrig) : 0;
          detallesEnriquecidos.push({ nombre, cantidad: d.cantidad, precioBs: d.precio_unitario, precioUsd: 0, cantidadAbonada: 0, estado: 'PENDIENTE' });
          return nombre;
        }
        const prod = d.producto_id > 0 ? this.db.prepare("SELECT p_venta_usd, es_por_peso, precio_kg_usd FROM productos WHERE id = ?").get(d.producto_id) : null;
        let precioUsd = 0;
        if (prod && prod.es_por_peso) {
          precioUsd = parseFloat(prod.precio_kg_usd || 0);
        } else if (prod) {
          precioUsd = parseFloat(prod.p_venta_usd || 0);
        } else {
          precioUsd = tasaOrig > 0 ? round2(d.precio_unitario / tasaOrig) : 0;
        }
        let precioBsActual;
        if (d.pagado === 1 && d.cantidad === 0) {
          precioBsActual = d.precio_unitario;
          precioUsd = tasaOrig > 0 ? round2(d.precio_unitario / tasaOrig) : 0;
        } else {
          precioBsActual = round2(precioUsd * tasa_actual);
        }
        const abonoRow = this.db.prepare(`
          SELECT COALESCE(SUM(vd.cantidad), 0) as total_abonado
          FROM ventas_detalle vd
          JOIN ventas v ON vd.venta_id = v.id
          WHERE v.fiado_id = ? AND vd.fiado_detalle_id = ? AND v.metodo LIKE '%Abono%'
        `).get(f.id, d.id);
        const cantidadAbonada = abonoRow?.total_abonado || 0;
        let cantidadOriginal = d.cantidad + cantidadAbonada;
        let estado = cantidadAbonada > 0 ? 'ABONADO' : 'PENDIENTE';
        let cantidadPagadaEnTotal = 0;
        if (d.cantidad === 0 && f.pagado) {
          if (cantidadAbonada === 0 && ventaPagoTotal) {
            const cantidadPagadaRow = this.db.prepare(`SELECT cantidad FROM ventas_detalle WHERE venta_id = ? AND producto = ? LIMIT 1`).get(ventaPagoTotal.id, nombre);
            if (cantidadPagadaRow) {
              cantidadOriginal = cantidadPagadaRow.cantidad;
              cantidadPagadaEnTotal = cantidadOriginal;
              estado = 'PAGADO';
            }
          } else if (cantidadAbonada > 0 && ventaPagoTotal) {
            const cantidadPagadaRow = this.db.prepare(`SELECT cantidad FROM ventas_detalle WHERE venta_id = ? AND fiado_detalle_id = ? LIMIT 1`).get(ventaPagoTotal.id, d.id);
            if (cantidadPagadaRow) {
              cantidadPagadaEnTotal = cantidadPagadaRow.cantidad;
              cantidadOriginal = cantidadAbonada + cantidadPagadaEnTotal;
              estado = 'MIXTO';
            } else {
              estado = 'ABONADO';
            }
          } else if (cantidadAbonada > 0 && !ventaPagoTotal) {
            estado = 'ABONADO';
          }
        }
        if (d.cantidad > 0) {
          totalBs += d.cantidad * precioBsActual;
          totalUsd += d.cantidad * precioUsd;
        }
        detallesEnriquecidos.push({
          nombre,
          cantidad: cantidadOriginal,
          precioBs: precioBsActual,
          precioUsd,
          cantidadAbonada,
          cantidadPagadaEnTotal,
          estado
        });
        if (estado === 'MIXTO') {
          return `${nombre} (x${cantidadOriginal}) - Abonado: ${cantidadAbonada}, Pagado: ${cantidadPagadaEnTotal}`;
        } else if (estado === 'PAGADO') {
          return `${nombre} (x${cantidadOriginal}) - Pagado`;
        } else if (cantidadAbonada > 0) {
          return `${nombre} (x${cantidadOriginal}) - Abonado: ${cantidadAbonada}`;
        } else {
          return `${nombre} (x${d.cantidad})`;
        }
      }).join(', ');
      const detalleStr = detallesEnriquecidos.map(d => `${d.nombre}|${d.cantidad}|${d.precioBs}|${d.precioUsd}|${d.cantidadAbonada}|${d.cantidadPagadaEnTotal || 0}|${d.estado}`).join(';;');
      return {
        id: f.id,
        cliente: f.cliente,
        fecha: f.fecha,
        pagado: f.pagado,
        tasa_momento: tasaMostrar,
        total_bs: totalBs,
        total_usd: totalUsd,
        productos: productos || '-',
        detalle_productos: detalleStr
      };
    });
    const gastos = this.db.prepare(`SELECT id, descripcion, monto_bs, monto_usd, metodo, fecha FROM gastos WHERE date(fecha) = ? ORDER BY fecha ASC`).all(fecha);
    const abonosFiados = this.db.prepare(`SELECT v.id, v.fecha, v.total_bs, v.total_usd, v.metodo, v.cliente, v.fiado_id, v.tasa_momento, (SELECT group_concat(producto || ' (x' || cantidad || ')', ', ') FROM ventas_detalle WHERE venta_id = v.id) as productos FROM ventas v WHERE v.fiado_id IS NOT NULL AND v.fiado_id > 0 AND date(v.fecha) = ? ORDER BY v.fecha ASC`).all(fecha);
    return { ventas: ventasAgrupadas, fiados, gastos, abonosFiados };
  }

  static buscar_proveedores(termino) { return this.db.prepare("SELECT * FROM proveedores WHERE nombre LIKE ? OR productos LIKE ?").all(`%${termino}%`, `%${termino}%`); }

  static guardar_proveedor(data) {
    if (data.id) {
      this.db.prepare("UPDATE proveedores SET nombre=?, contacto=?, productos=? WHERE id=?").run(data.nombre, data.contacto, data.productos, data.id);
    } else {
      this.db.prepare("INSERT INTO proveedores (nombre, contacto, productos) VALUES (?, ?, ?)").run(data.nombre, data.contacto, data.productos);
    }
  }

  static eliminar_proveedor(id) { this.db.prepare("DELETE FROM proveedores WHERE id=?").run(id); }

  static registrar_gasto(descripcion, monto_bs, monto_usd, metodo) {
    this.db.prepare(`INSERT INTO gastos (fecha, descripcion, monto_bs, monto_usd, metodo) VALUES (?, ?, ?, ?, ?)`).run(this._nowStr(), descripcion, monto_bs, monto_usd, metodo);
    return true;
  }

  static obtener_resumen_caja(fecha) {
    const ventas = this.db.prepare(`SELECT metodo, total_bs, total_usd, tasa_momento FROM ventas WHERE fecha LIKE ?`).all(fecha + '%');
    const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
    let ingresosAgrupados = {};

    const esMetodoExtranjero = (metodo) => {
      const extranjeros = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];
      return extranjeros.includes(metodo);
    };

    ventas.forEach(v => {
      let metodoNorm = v.metodo;
      metodoNorm = metodoNorm.replace('Abono Fiado: ', '').replace('Pago Fiado: ', '').replace('Cobro Fiado: ', '');

      const tasaVenta = (v.tasa_momento && parseFloat(v.tasa_momento) > 0) ? parseFloat(v.tasa_momento) : tasa_actual;
      const usdVenta = parseFloat(v.total_usd || 0);
      const bsVenta = parseFloat(v.total_bs || 0) === 0 && usdVenta > 0 ? parseFloat((usdVenta * tasaVenta).toFixed(2)) : parseFloat(v.total_bs || 0);

      if (metodoNorm.includes('Mixto:')) {
        const metodosStr = metodoNorm.replace('Mixto:', '').trim();
        const metodosArray = metodosStr.split('+').map(m => m.trim());
        const metodosBs = metodosArray.filter(m => !esMetodoExtranjero(m));
        const metodosUsd = metodosArray.filter(m => esMetodoExtranjero(m));

        if (metodosBs.length === 1 && metodosUsd.length === 1) {
          const metodoBs = metodosBs[0];
          const metodoUsd = metodosUsd[0];
          if (!ingresosAgrupados[metodoBs]) ingresosAgrupados[metodoBs] = { bs: 0, usd: 0 };
          if (!ingresosAgrupados[metodoUsd]) ingresosAgrupados[metodoUsd] = { bs: 0, usd: 0 };
          ingresosAgrupados[metodoBs].bs += bsVenta;
          ingresosAgrupados[metodoUsd].usd += usdVenta;
        } else {
          if (!ingresosAgrupados['Mixto (Bs)']) ingresosAgrupados['Mixto (Bs)'] = { bs: 0, usd: 0 };
          if (!ingresosAgrupados['Mixto ($)']) ingresosAgrupados['Mixto ($)'] = { bs: 0, usd: 0 };
          if (bsVenta > 0) ingresosAgrupados['Mixto (Bs)'].bs += bsVenta;
          if (usdVenta > 0) ingresosAgrupados['Mixto ($)'].usd += usdVenta;
        }
      } else {
        if (!ingresosAgrupados[metodoNorm]) { ingresosAgrupados[metodoNorm] = { bs: 0, usd: 0 }; }
        ingresosAgrupados[metodoNorm].bs += bsVenta;
        ingresosAgrupados[metodoNorm].usd += usdVenta;
      }
    });

    const ingresos = Object.keys(ingresosAgrupados).map(k => ({ metodo: k, suma_bs: ingresosAgrupados[k].bs, suma_usd: ingresosAgrupados[k].usd }));
    const gastos = this.db.prepare(`SELECT metodo, SUM(monto_bs) as suma_bs, SUM(monto_usd) as suma_usd FROM gastos WHERE fecha LIKE ? GROUP BY metodo`).all(fecha + '%');
    return { ingresos, gastos };
  }

  static obtener_resumen_caja_v2(fecha) {
    const ventas = this.db.prepare(
      `SELECT metodo, total_bs, total_usd, tasa_momento, monto_recibido
       FROM ventas WHERE fecha LIKE ?`
    ).all(fecha + '%');
    const tasa_actual = parseFloat(this.obtener_config("tasa_usd"));
    let ingresosAgrupados = {};

    const esMetodoExtranjero = (metodo) => {
      const extranjeros = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];
      return extranjeros.includes(metodo.trim());
    };

    ventas.forEach(v => {
      let metodoNorm = v.metodo;
      metodoNorm = metodoNorm.replace('Abono Fiado: ', '')
                             .replace('Pago Fiado: ', '')
                             .replace('Cobro Fiado: ', '');

      const montoRecibido = parseFloat(v.monto_recibido || 0);

      if (metodoNorm.includes('Mixto:')) {
        const desgloseStr = metodoNorm.replace(/^Mixto:\s*/, '');
        const partes = desgloseStr.split('|');
        for (let i = 1; i < partes.length; i++) {
          const segmento = partes[i].trim();
          if (!segmento) continue;
          const match = segmento.match(/^([^:]+):([^~]+)(?:~(.+))?$/);
          if (match) {
            const nombreMetodo = match[1].trim();
            const montoStr = match[2].trim();
            const monto = parseFloat(montoStr);
            if (isNaN(monto) || monto <= 0) continue;
            if (esMetodoExtranjero(nombreMetodo)) {
              if (!ingresosAgrupados[nombreMetodo]) ingresosAgrupados[nombreMetodo] = { bs: 0, usd: 0 };
              ingresosAgrupados[nombreMetodo].usd += monto;
            } else {
              if (!ingresosAgrupados[nombreMetodo]) ingresosAgrupados[nombreMetodo] = { bs: 0, usd: 0 };
              ingresosAgrupados[nombreMetodo].bs += monto;
            }
          }
        }
        return;
      }

      let bsVenta = parseFloat(v.total_bs || 0);
      let usdVenta = parseFloat(v.total_usd || 0);
      const tasaVenta = (v.tasa_momento && parseFloat(v.tasa_momento) > 0)
                          ? parseFloat(v.tasa_momento) : tasa_actual;

      if (montoRecibido > 0) {
        if (esMetodoExtranjero(metodoNorm)) {
          usdVenta = montoRecibido;
          bsVenta = 0;
        } else {
          bsVenta = montoRecibido;
          usdVenta = 0;
        }
      } else {
        if (esMetodoExtranjero(metodoNorm) && bsVenta === 0 && usdVenta > 0) {
          bsVenta = parseFloat((usdVenta * tasaVenta).toFixed(2));
        }
      }

      if (!ingresosAgrupados[metodoNorm]) {
        ingresosAgrupados[metodoNorm] = { bs: 0, usd: 0 };
      }
      ingresosAgrupados[metodoNorm].bs += bsVenta;
      ingresosAgrupados[metodoNorm].usd += usdVenta;
    });

    const ingresos = Object.keys(ingresosAgrupados).map(k => ({
      metodo: k,
      suma_bs: ingresosAgrupados[k].bs,
      suma_usd: ingresosAgrupados[k].usd
    }));

    const gastos = this.db.prepare(
      `SELECT metodo, SUM(monto_bs) as suma_bs, SUM(monto_usd) as suma_usd
       FROM gastos WHERE fecha LIKE ? GROUP BY metodo`
    ).all(fecha + '%');

    return { ingresos, gastos };
  }

  static obtener_gastos_dia(fecha) {
    return this.db.prepare(`SELECT id, descripcion, monto_bs, monto_usd, metodo FROM gastos WHERE fecha LIKE ? ORDER BY id DESC`).all(fecha + '%');
  }

  static verificar_cierre(fecha) {
    return this.db.prepare("SELECT * FROM cierres WHERE fecha = ?").get(fecha);
  }

  static guardar_cierre(data) {
    this.db.prepare(`INSERT OR REPLACE INTO cierres (fecha, ingresos, gastos, neto, estado, arqueo) VALUES (?, ?, ?, ?, ?, ?)`).run(data.fecha, data.ingresos, data.gastos, data.neto, data.estadoMensaje, JSON.stringify(data.arqueo));
    return true;
  }

  static obtener_saldo_fiado_real(fiado_id) {
    const fiado = this.db.prepare("SELECT total_bs, tasa_momento FROM fiados WHERE id = ?").get(fiado_id);
    if (!fiado) return null;
    return { total_bs: parseFloat(fiado.total_bs), tasa_momento: parseFloat(fiado.tasa_momento) };
  }

  static obtener_ventas_raw_para_reporte(fecha) {
    return this.db.prepare(`
      SELECT v.id, v.fecha, v.cliente, v.total_bs, v.total_usd, v.metodo, v.tasa_momento,
             (SELECT group_concat(producto || ' (x' || cantidad || ')', ', ') FROM ventas_detalle WHERE venta_id = v.id) as productos
      FROM ventas v WHERE date(v.fecha) = ? AND (v.fiado_id IS NULL OR v.fiado_id = 0)
      ORDER BY v.fecha ASC
    `).all(fecha);
  }
}

module.exports = DatabaseService;
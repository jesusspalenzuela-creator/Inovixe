const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const DatabaseService = require('../database/services/DatabaseService');

class IPCHandlers {
  static init() {
    ipcMain.handle('db:buscar-productos', async (_, t) => DatabaseService.buscar_productos(t));
    ipcMain.handle('db:obtener-productos-criticos', async () => DatabaseService.obtener_productos_criticos());
    ipcMain.handle('db:agregar-producto', async (_, d) => DatabaseService.agregar_producto(d));
    ipcMain.handle('db:editar-producto', async (_, d) => DatabaseService.editar_producto(d));
    ipcMain.handle('db:eliminar-producto', async (_, i) => DatabaseService.eliminar_producto(i));
    ipcMain.handle('db:asegurar-cliente', async (_, n, f, t) => DatabaseService.asegurar_cliente(n, f, t));
    ipcMain.handle('db:obtener-nombres-clientes', async () => DatabaseService.obtener_nombres_clientes());
    ipcMain.handle('db:eliminar-cliente', async (_, i) => DatabaseService.eliminar_cliente(i));
    ipcMain.handle('db:obtener-compras-cliente', async (_, n) => DatabaseService.obtener_compras_cliente(n));
    ipcMain.handle('db:agregar-cliente', async (_, n, t) => DatabaseService.agregar_cliente_manual(n, t));
    ipcMain.handle('db:editar-cliente', async (_, id, oldN, newN, newT) => DatabaseService.editar_cliente(id, oldN, newN, newT));
    ipcMain.handle('db:buscar-clientes', async (_, f) => DatabaseService.ejecutar_consulta("SELECT id, nombre, telefono FROM clientes WHERE nombre LIKE ? ORDER BY nombre ASC", [`%${f.toUpperCase()}%`]));
    ipcMain.handle('db:obtener-saldo-fiado-real', async (_, id) => DatabaseService.obtener_saldo_fiado_real(id));
    ipcMain.handle('db:registrar-abono-multiple', async (_, fiadoId, items, metodo, totalBs, totalUsd, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, cliente, montoEsperadoBs, montoEsperadoUsd) => DatabaseService.registrar_abono_multiple(fiadoId, items, metodo, totalBs, totalUsd, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, cliente, montoEsperadoBs, montoEsperadoUsd));
    ipcMain.handle('db:registrar-venta-completa', async (_, d) => DatabaseService.registrar_venta_completa(d.cliente, d.total_bs, d.total_usd, d.metodo, d.descuento, d.items, d.es_seleccionado, d.telefono, d.deducirStock, d.monto_recibido, d.vuelto, d.vuelto_entregado, d.vuelto_metodo));
    ipcMain.handle('db:obtener-producto-por-sku', async (_, sku) => DatabaseService.obtener_producto_por_sku(sku));

    ipcMain.handle('db:get-ventas-hoy', async () => DatabaseService.get_ventas_hoy());
    ipcMain.handle('db:registrar-gasto', async (_, desc, bs, usd, metodo) => DatabaseService.registrar_gasto(desc, bs, usd, metodo));
    ipcMain.handle('db:obtener-resumen-caja', async (_, fecha) => DatabaseService.obtener_resumen_caja(fecha));
    ipcMain.handle('db:obtener-resumen-caja-v2', async (_, fecha) => DatabaseService.obtener_resumen_caja_v2(fecha));
    ipcMain.handle('db:obtener-gastos-dia', async (_, fecha) => DatabaseService.obtener_gastos_dia(fecha));
    ipcMain.handle('db:verificar-cierre', async (_, fecha) => DatabaseService.verificar_cierre(fecha));
    ipcMain.handle('db:guardar-cierre', async (_, data) => DatabaseService.guardar_cierre(data));
    ipcMain.handle('db:get-detalle-fiado', async (_, id) => DatabaseService.get_detalle_fiado(id));
    ipcMain.handle('db:get-abonos-fiado', async (_, fiado_id) => DatabaseService.get_abonos_fiado(fiado_id));
    ipcMain.handle('db:agregar-cargo-adicional-fiado', async (_, fid, m, d) => DatabaseService.agregar_cargo_adicional_fiado(fid, m, d));
    ipcMain.handle('db:eliminar-detalle-fiado', async (_, did, fid) => DatabaseService.eliminar_detalle_fiado(did, fid));
    ipcMain.handle('db:agregar-producto-a-fiado', async (_, fid, pid, c, p) => DatabaseService.agregar_producto_a_fiado(fid, pid, c, p));
    ipcMain.handle('db:actualizar-cantidad-fiado', async (_, did, fid, c) => DatabaseService.actualizar_cantidad_fiado(did, fid, c));
    ipcMain.handle('db:registrar-pago-fiado-como-venta', async (_, fid, c, m, totalBsOverride, totalUsdOverride, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, montoEsperadoBs, montoEsperadoUsd) => DatabaseService.registrar_pago_fiado_como_venta(fid, c, m, totalBsOverride, totalUsdOverride, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, montoEsperadoBs, montoEsperadoUsd));
    ipcMain.handle('db:registrar-pago-parcial-articulo', async (_, fid, did, c, ct, m, totalBsOverride, totalUsdOverride) => DatabaseService.registrar_pago_parcial_articulo(fid, did, c, ct, m, totalBsOverride, totalUsdOverride));
    ipcMain.handle('db:get-fiados-pendientes', async () => DatabaseService.get_fiados_pendientes());
    ipcMain.handle('db:registrar-fiado-completo', async (_, d) => DatabaseService.registrar_fiado_completo(d.cliente, d.total_bs, d.items, d.es_seleccionado, d.telefono));
    ipcMain.handle('db:buscar-fiados', async (_, f = "") => DatabaseService.ejecutar_consulta("SELECT id, cliente, fecha, total_bs, tasa_momento FROM fiados WHERE pagado = 0 AND UPPER(cliente) LIKE ?", [`%${f.toUpperCase()}%`]));
    ipcMain.handle('db:finalizar-fiado-pagado', async (_, fiado_id) => DatabaseService.finalizar_fiado_pagado(fiado_id));
    ipcMain.handle('db:crear-respaldo', async () => {
      const fecha = new Date().toLocaleDateString('es-VE').replace(/\//g, '-');
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar Respaldo',
        defaultPath: `Respaldo_Sistema_${fecha}.db`,
        filters: [{ name: 'Base de Datos', extensions: ['db', 'sqlite'] }]
      });
      if (canceled || !filePath) return { success: false };
      try {
        DatabaseService.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        fs.copyFileSync(DatabaseService.db.name, filePath);
        return { success: true };
      } catch (error) { return { success: false, error: error.message }; }
    });
    ipcMain.handle('db:restaurar-respaldo', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Seleccionar Respaldo', properties: ['openFile'],
        filters: [{ name: 'Base de Datos', extensions: ['db', 'sqlite'] }]
      });
      if (canceled || filePaths.length === 0) return { success: false };

      // Confirmación adicional para evitar restauraciones accidentales
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Confirmar restauración',
        message: '¿Está seguro de restaurar este respaldo? La base de datos actual será reemplazada y la aplicación se reiniciará.',
        buttons: ['Cancelar', 'Restaurar'],
        defaultId: 0,
        cancelId: 0
      });
      if (response !== 1) return { success: false, error: 'Restauración cancelada por el usuario.' };

      try {
        const backupPath = filePaths[0];
        const stats = fs.statSync(backupPath);
        if (stats.size < 1024) {
          return { success: false, error: 'El archivo de respaldo está vacío o corrupto.' };
        }
        const buffer = fs.readFileSync(backupPath);
        const header = buffer.toString('utf8', 0, 16);
        if (!header.includes('SQLite format 3')) {
          return { success: false, error: 'El archivo seleccionado no es una base de datos SQLite válida.' };
        }
        const currentDbPath = DatabaseService.db.name;
        DatabaseService.db.close();
        await new Promise(resolve => setTimeout(resolve, 500));
        fs.copyFileSync(backupPath, currentDbPath);
        app.relaunch();
        app.exit();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    ipcMain.handle('db:buscar-proveedores', async (_, t) => DatabaseService.buscar_proveedores(t));
    ipcMain.handle('db:guardar-proveedor', async (_, d) => DatabaseService.guardar_proveedor(d));
    ipcMain.handle('db:eliminar-proveedor', async (_, i) => DatabaseService.eliminar_proveedor(i));
    ipcMain.handle('db:obtener-config', async (_, c) => DatabaseService.obtener_config(c));
    ipcMain.handle('db:actualizar-tasa-y-precios', async (_, t, manual) => DatabaseService.actualizar_tasa_y_precios(t, manual));
    ipcMain.handle('db:get-datos-grafico', async () => DatabaseService.get_datos_grafico());
    ipcMain.handle('db:obtener-reporte-diario', async (_, f) => DatabaseService.obtener_reporte_diario(f));
    ipcMain.handle('db:obtener-dias-con-actividad', async () => DatabaseService.obtener_dias_con_actividad());
    ipcMain.handle('db:get-count-stock-bajo', async () => DatabaseService.get_count_stock_bajo());
    ipcMain.handle('db:get-count-clientes', async () => DatabaseService.get_count_clientes());
    ipcMain.handle('db:validar-login', async (_, u, p) => DatabaseService.validar_login(u, p));
    ipcMain.handle('db:obtener-usuarios', async () => DatabaseService.obtener_usuarios());
    ipcMain.handle('db:agregar-usuario', async (_, n, u, p, r, perms) => DatabaseService.agregar_usuario(n, u, p, r, perms));
    ipcMain.handle('db:eliminar-usuario', async (_, i) => DatabaseService.eliminar_usuario(i));
    ipcMain.handle('db:actualizar-perfil', async (_, id, n, u, p) => DatabaseService.actualizar_perfil(id, n, u, p));
    ipcMain.handle('utils:open-external', async (_, url) => require('electron').shell.openExternal(url));
    ipcMain.handle('utils:guardar-pdf', async (_, nombreArchivo, base64Data) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Guardar Recibo PDF',
        defaultPath: nombreArchivo,
        filters: [{ name: 'Archivos PDF', extensions: ['pdf'] }]
      });
      if (canceled || !filePath) return { success: false };
      try {
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    ipcMain.handle('utils:obtener-tasa-bcv', async () => {
      const https = require('https');
      const consultarAPI = (url) => new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
          let data = ''; res.on('data', (c) => data += c);
          res.on('end', () => resolve(data));
        }).on('error', () => resolve(null));
      });
      try {
        const res1 = await consultarAPI('https://ve.dolarapi.com/v1/dolares/oficial');
        if (res1 && JSON.parse(res1).promedio) return parseFloat(JSON.parse(res1).promedio);
        const res2 = await consultarAPI('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv');
        if (res2 && JSON.parse(res2).monitors?.bcv?.price) return parseFloat(JSON.parse(res2).monitors.bcv.price);
        return null;
      } catch { return null; }
    });
    ipcMain.handle('db:obtener-ventas-raw', async (_, fecha) => DatabaseService.obtener_ventas_raw_para_reporte(fecha));

    // Handler seguro para ejecutar consultas: solo permite SELECT y sin múltiples sentencias
    ipcMain.handle('db:ejecutar-consulta', async (_, consulta, parametros) => {
      const trimmed = consulta.trim().toUpperCase();
      if (!trimmed.startsWith('SELECT')) {
        throw new Error('Solo se permiten consultas de lectura (SELECT).');
      }
      if (trimmed.includes(';')) {
        throw new Error('No se permiten múltiples sentencias SQL.');
      }
      return DatabaseService.ejecutar_consulta(consulta, parametros);
    });
  }
}

module.exports = IPCHandlers;
// Función maestra que se comunica con tu servidor en Contabo/EasyPanel
async function callDB(accion, ...argumentos) {
    try {
        const res = await fetch('/api/finovixe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion, argumentos })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        return data.data;
    } catch (error) {
        console.error(`Error de red en ${accion}:`, error);
        throw error;
    }
}

// Simulamos la API exacta de Electron para que tus pantallas no noten la diferencia
const electronAPI = {
  db: {
    buscarProductos: (t) => callDB('buscar_productos', t),
    obtenerProductosCriticos: () => callDB('obtener_productos_criticos'),
    agregarProducto: (d) => callDB('agregar_producto', d),
    editarProducto: (d) => callDB('editar_producto', d),
    eliminarProducto: (i) => callDB('eliminar_producto', i),
    asegurarCliente: (n, f, t) => callDB('asegurar_cliente', n, f, t),
    obtenerNombresClientes: () => callDB('obtener_nombres_clientes'),
    eliminarCliente: (i) => callDB('eliminar_cliente', i),
    obtenerComprasCliente: (n) => callDB('obtener_compras_cliente', n),
    buscarClientes: (f) => callDB('ejecutar_consulta', "SELECT id, nombre, telefono FROM clientes WHERE nombre LIKE ? ORDER BY nombre ASC", [`%${f.toUpperCase()}%`]),
    agregarCliente: (n, t) => callDB('agregar_cliente_manual', n, t),
    editarCliente: (id, o, n, t) => callDB('editar_cliente', id, o, n, t),
    
    // Desestructuramos el objeto D exactamente como lo hacías en handlers.js
    registrarVentaCompleta: (d) => callDB('registrar_venta_completa', d.cliente, d.total_bs, d.total_usd, d.metodo, d.descuento, d.items, d.es_seleccionado, d.telefono, d.deducirStock, d.monto_recibido, d.vuelto, d.vuelto_entregado, d.vuelto_metodo),
    
    getVentasHoy: () => callDB('get_ventas_hoy'),
    registrarGasto: (desc, bs, usd, metodo) => callDB('registrar_gasto', desc, bs, usd, metodo),
    obtenerResumenCaja: (fecha) => callDB('obtener_resumen_caja', fecha),
    obtenerResumenCajaV2: (fecha) => callDB('obtener_resumen_caja_v2', fecha),
    obtenerGastosDia: (fecha) => callDB('obtener_gastos_dia', fecha),
    verificarCierre: (fecha) => callDB('verificar_cierre', fecha),
    guardarCierre: (data) => callDB('guardar_cierre', data),
    getDetalleFiado: (id) => callDB('get_detalle_fiado', id),
    getAbonosFiado: (fiado_id) => callDB('get_abonos_fiado', fiado_id),
    agregarProductoAFiado: (fid, pid, c, p) => callDB('agregar_producto_a_fiado', fid, pid, c, p),
    actualizarCantidadFiado: (did, fid, c) => callDB('actualizar_cantidad_fiado', did, fid, c),
    registrarPagoFiadoComoVenta: (fid, c, m, totalBsOverride, totalUsdOverride, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, montoEsperadoBs, montoEsperadoUsd) => callDB('registrar_pago_fiado_como_venta', fid, c, m, totalBsOverride, totalUsdOverride, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, montoEsperadoBs, montoEsperadoUsd),
    registrarPagoParcialArticulo: (fid, did, c, ct, m, totalBsOverride, totalUsdOverride) => callDB('registrar_pago_parcial_articulo', fid, did, c, ct, m, totalBsOverride, totalUsdOverride),
    getFiadosPendientes: () => callDB('get_fiados_pendientes'),
    
    // Desestructuramos el objeto D para fiados
    registrarFiadoCompleto: (d) => callDB('registrar_fiado_completo', d.cliente, d.total_bs, d.items, d.es_seleccionado, d.telefono),
    
    buscarFiados: (f = "") => callDB('ejecutar_consulta', "SELECT id, cliente, fecha, total_bs, tasa_momento FROM fiados WHERE pagado = 0 AND UPPER(cliente) LIKE ?", [`%${f.toUpperCase()}%`]),
    agregarCargoAdicionalFiado: (fid, m, d) => callDB('agregar_cargo_adicional_fiado', fid, m, d),
    eliminarDetalleFiado: (did, fid) => callDB('eliminar_detalle_fiado', did, fid),
    finalizarFiadoPagado: (fid) => callDB('finalizar_fiado_pagado', fid),
    
    // Las copias de seguridad ahora son avisos porque la base de datos está en la nube
    crearRespaldo: async () => { 
        alert('Para la versión en la nube, las copias de seguridad se descargan desde tu panel del servidor.'); 
        return { success: true }; 
    },
    restaurarRespaldo: async () => { 
        alert('Para restaurar, debes subir el archivo database.sqlite directamente al servidor.'); 
        return { success: false }; 
    },
    
    buscarProveedores: (t) => callDB('buscar_proveedores', t),
    guardarProveedor: (d) => callDB('guardar_proveedor', d),
    eliminarProveedor: (i) => callDB('eliminar_proveedor', i),
    obtenerConfig: (c) => callDB('obtener_config', c),
    actualizarTasaYPrecios: (t, m) => callDB('actualizar_tasa_y_precios', t, m),
    getDatosGrafico: () => callDB('get_datos_grafico'),
    obtenerReporteDiario: (f) => callDB('obtener_reporte_diario', f),
    obtenerDiasConActividad: () => callDB('obtener_dias_con_actividad'),
    getCountStockBajo: () => callDB('get_count_stock_bajo'),
    getCountClientes: () => callDB('get_count_clientes'),
    validarLogin: (u, p) => callDB('validar_login', u, p),
    obtenerUsuarios: () => callDB('obtener_usuarios'),
    agregarUsuario: (n, u, p, r, perms) => callDB('agregar_usuario', n, u, p, r, perms),
    eliminarUsuario: (i) => callDB('eliminar_usuario', i),
    actualizarPerfil: (id, n, u, p) => callDB('actualizar_perfil', id, n, u, p),
    obtenerSaldoFiadoReal: (id) => callDB('obtener_saldo_fiado_real', id),
    registrarAbonoMultiple: (fiadoId, items, metodo, totalBs, totalUsd, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, cliente, montoEsperadoBs, montoEsperadoUsd) => callDB('registrar_abono_multiple', fiadoId, items, metodo, totalBs, totalUsd, montoRecibido, vuelto, vueltoEntregado, vueltoMetodo, cliente, montoEsperadoBs, montoEsperadoUsd),
    obtenerVentasRaw: (fecha) => callDB('obtener_ventas_raw_para_reporte', fecha),
    ejecutarConsulta: (consulta, params) => callDB('ejecutar_consulta', consulta, params),
    obtenerProductoPorSku: (sku) => callDB('obtener_producto_por_sku', sku),
  },
  utils: {
    // Abre enlaces en una nueva pestaña del navegador
    openExternalLink: (url) => window.open(url, '_blank'),
    // Consulta directa a la API web sin pasar por Electron
    obtenerTasaBCV: async () => {
      try {
        const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await res.json();
        return data.promedio ? parseFloat(data.promedio) : null;
      } catch (e) { return null; }
    },
    // Fuerza la descarga del PDF en el navegador
    guardarPDF: (nombre, base64) => {
      const link = document.createElement('a');
      link.href = 'data:application/pdf;base64,' + base64;
      link.download = nombre;
      link.click();
      return { success: true };
    }
  },
  licencia: {
    // Al estar en la nube, saltamos la validación de hardware
    obtenerHWID: async () => 'WEB-VERSION',
    intentarActivacion: async (llave) => true
  },
  actualizarTasaDisplay: (tasa) => {
    const tasaElement = document.getElementById('global-tasa');
    if (tasaElement) {
      tasaElement.textContent = parseFloat(tasa).toLocaleString('es-VE', {minimumFractionDigits: 2});
    }
  }
};

// Exponemos la variable para que inventario.js y el resto la encuentren
window.electronAPI = electronAPI;
// Si usas iframes (como parece en tu código), esto asegura que window.parent.electronAPI funcione
if (window.parent) {
    window.parent.electronAPI = electronAPI;
}
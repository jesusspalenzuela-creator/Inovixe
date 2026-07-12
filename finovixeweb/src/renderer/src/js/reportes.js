const domDias = document.getElementById('dias-container'), domBuscar = document.getElementById('buscar-fecha');

const METODOS_EXTRANJEROS = ['Divisas-USD', 'Zelle', 'Zinli', 'Binance-USDT', 'Binance-USDC'];

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function esExtranjero(metodo) {
  return METODOS_EXTRANJEROS.some(m => metodo.includes(m));
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return { fecha: '-', hora: '' };
  const partes = fechaStr.split(' ');
  return { fecha: partes[0] || '-', hora: partes[1] || '' };
}

function limpiarNombreProducto(nombre) {
  if (nombre.toUpperCase().includes('CARGO ADICIONAL')) {
    return nombre.replace(/\s*\(x1\)\s*/gi, '').trim();
  }
  return nombre;
}

function limpiarMetodoReporte(metodo) {
  if (!metodo) return '-';
  let m = metodo.toString();
  m = m.replace(/^(Abono Fiado: |Pago Fiado: |Cobro Fiado: )/, '');
  if (m.includes('|')) {
    m = m.split('|')[0];
  }
  m = m.replace(/~[\d.,]+/g, '');
  m = m.trim();
  return m || '-';
}

function formatearMontoExtranjeroVisual(valor) {
    if (isNaN(valor)) return '0';
    const redondeado = Math.round(valor * 1e8) / 1e8;
    let str = redondeado.toFixed(8);
    str = str.replace(/\.?0+$/, '');
    if (!str.includes('.')) {
        str += '.00';
    } else {
        const partes = str.split('.');
        if (partes[1].length < 2) {
            str = partes[0] + '.' + partes[1].padEnd(2, '0');
        }
    }
    str = str.replace('.', ',');
    const partes = str.split(',');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return partes.join(',');
}

function desglosarMetodoMixto(metodoRaw) {
  if (!metodoRaw || !metodoRaw.includes('|')) return null;
  const partes = metodoRaw.split('|');
  if (partes.length < 2) return null;
  const componentes = [];
  for (let i = 1; i < partes.length; i++) {
    const seg = partes[i].trim();
    if (!seg) continue;
    const match = seg.match(/^([^:]+):([^~]+)(?:~(.+))?$/);
    if (match) {
      const nombre = match[1].trim();
      const montoStr = match[2].trim();
      const monto = parseFloat(montoStr);
      if (isNaN(monto)) continue;
      const esExt = esExtranjero(nombre);
      componentes.push({
        nombre: nombre,
        monto: monto,
        esExt: esExt
      });
    }
  }
  return componentes.length ? componentes : null;
}

function obtenerSimboloMoneda(metodo) {
    if (!metodo) return '?';
    const m = metodo.toLowerCase().trim();
    if (m.includes('usdt')) return 'USDT';
    if (m.includes('usdc')) return 'USDC';
    if (m.includes('zelle') || m.includes('zinli') || m.includes('divisas-usd') || m.includes('usd')) return '$';
    if (m.includes('bs') || m.includes('bolívar') || m.includes('pago móvil') || m.includes('transferencia') || m.includes('punto de venta')) return 'Bs';
    return 'Bs';
}

function capitalizarMetodo(str) {
    if (!str) return '';
    let resultado = str.toLowerCase();
    resultado = resultado.charAt(0).toUpperCase() + resultado.slice(1);
    resultado = resultado.replace(/\b(bs|usd|usdt|usdc)\b/gi, match => match.toUpperCase());
    resultado = resultado.replace(/\b(bcv)\b/gi, 'BCV');
    return resultado;
}

/**
 * Corrige el texto de productos que viene de SQLite.
 * Busca patrones como "PRODUCTO (cantidad kg)" y formatea la cantidad:
 * - Si es entero, muestra sin decimales (1 kg)
 * - Si tiene decimales, muestra hasta 3 decimales eliminando ceros finales (0.535 kg)
 */
function formatearTextoProductos(texto) {
  if (!texto) return texto;
  // Reemplaza cualquier número seguido de " kg)" por su versión formateada
  return texto.replace(/(\d+\.?\d*)\s*kg\)/g, (match, num) => {
    const valor = parseFloat(num);
    if (isNaN(valor)) return match;
    if (valor % 1 === 0) {
      return valor + ' kg)';
    } else {
      // Redondear a 3 decimales y eliminar ceros finales
      let str = valor.toFixed(3);
      str = str.replace(/\.?0+$/, '');
      return str + ' kg)';
    }
  });
}

async function init() {
  cargarDias();
  domBuscar.addEventListener('keyup', cargarDias);
}

async function cargarDias() {
  const filtro = domBuscar.value.toLowerCase();
  try {
    const dias = await window.parent.electronAPI.db.obtenerDiasConActividad();
    const container = domDias;

    if (!dias || !dias.length) {
      container.innerHTML = '<p class="text-center text-slate-500 mt-10 text-[13px]">No hay actividad registrada aún.</p>';
      return;
    }

    const diasFiltrados = dias.filter(d => d.toLowerCase().includes(filtro));
    if (!diasFiltrados.length) {
      container.innerHTML = '<p class="text-center text-slate-500 mt-10 text-[13px]">No se encontraron días con ese filtro.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    diasFiltrados.forEach((d, index) => {
      const partesFecha = d.split('-');
      const diaNum = partesFecha[2] || d;
      const mesNum = partesFecha[1] || '';
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const mesTexto = meses[parseInt(mesNum) - 1] || '';

      const card = document.createElement('div');
      card.className = "dia-card";
      card.style.animationDelay = `${index * 0.04}s`;
      card.innerHTML = `
        <div class="avatar-dia">
          <span class="dia-num">${escapeHtml(diaNum)}</span>
          ${mesTexto ? `<span class="dia-mes">${escapeHtml(mesTexto)}</span>` : ''}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-[15px] font-bold text-slate-800">${escapeHtml(d)}</h3>
          <p class="text-xs text-slate-400 mt-0.5">Reporte diario</p>
        </div>
        <button onclick="generarReporte('${escapeHtml(d)}')" class="btn-generar">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          Generar PDF
        </button>`;
      fragment.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
  } catch (e) {
    domDias.innerHTML = '<p class="text-center text-red-500 mt-10 text-[13px]">Error al cargar los días.</p>';
  }
}

function agruparTransacciones(transacciones) {
  const grupos = new Map();
  transacciones.forEach(v => {
    const key = `${v.cliente}_${v.fecha}_${v.productos}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        fecha: v.fecha,
        cliente: v.cliente,
        productos: v.productos,
        total_bs: 0,
        total_usd: 0,
        tasa_momento: v.tasa_momento || 1,
        metodos: [],
        vuelto: v.vuelto || 0,
        vuelto_entregado: v.vuelto_entregado || 0,
        vuelto_metodo: v.vuelto_metodo || ''
      });
    }
    const grupo = grupos.get(key);

    const desglose = desglosarMetodoMixto(v.metodo);
    if (desglose) {
      desglose.forEach(comp => {
        if (comp.esExt) {
          grupo.total_usd += comp.monto;
        } else {
          grupo.total_bs += comp.monto;
        }
      });
    } else {
      const esExt = esExtranjero(v.metodo);
      if (v.monto_recibido != null && parseFloat(v.monto_recibido) > 0) {
        if (esExt) {
          grupo.total_usd += parseFloat(v.monto_recibido);
        } else {
          grupo.total_bs += parseFloat(v.monto_recibido);
        }
      } else {
        if (esExt) {
          grupo.total_usd += parseFloat(v.total_usd || 0);
        } else {
          grupo.total_bs += parseFloat(v.total_bs || 0);
        }
      }
    }

    grupo.metodos.push({
      metodo: v.metodo,
      bs: parseFloat(v.total_bs || 0),
      usd: parseFloat(v.total_usd || 0)
    });

    if (!grupo.tasa_momento && v.tasa_momento) {
      grupo.tasa_momento = v.tasa_momento;
    }
  });
  return Array.from(grupos.values());
}

function formatearNombresMetodos(metodos) {
  if (metodos.length === 1) {
    return limpiarMetodoReporte(metodos[0].metodo);
  }
  const nombres = metodos.map(m => limpiarMetodoReporte(m.metodo));
  return 'Mixto: ' + nombres.join(' + ');
}

function formatearVuelto(vuelto, vueltoEntregado, vueltoMetodo, tasa) {
    if (!vueltoEntregado || vuelto <= 0) return '';
    const metodo = vueltoMetodo || 'Método no especificado';
    const esExt = esExtranjero(metodo);
    if (esExt) {
        const simbolo = obtenerSimboloMoneda(metodo);
        const valorConvertido = vuelto / (tasa > 0 ? tasa : 1);
        return `Sí – ${capitalizarMetodo(metodo)}: ${simbolo} ${formatearMontoExtranjeroVisual(valorConvertido)}`;
    } else {
        return `Sí – ${capitalizarMetodo(metodo)}: Bs ${vuelto.toLocaleString('es-VE',{minimumFractionDigits:2})}`;
    }
}

async function generarReporte(fecha) {
  try {
    window.parent.Swal.fire({ title: 'Generando reporte...', didOpen: () => window.parent.Swal.showLoading() });
    const datos = await window.parent.electronAPI.db.obtenerReporteDiario(fecha);
    if (!datos || (!datos.ventas.length && !datos.fiados.length && !datos.gastos.length && !datos.abonosFiados.length)) {
      window.parent.Swal.close();
      window.parent.Swal.fire({ icon: 'info', title: 'Sin datos', text: `No hay actividad registrada el ${fecha}.`, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
      return;
    }
    const tasaActual = parseFloat(await window.parent.electronAPI.db.obtenerConfig("tasa_usd")) || 1.0;

    const productosPorPeso = await window.parent.electronAPI.db.ejecutarConsulta(
      `SELECT nombre, precio_kg_bs FROM productos WHERE es_por_peso = 1`
    );
    const mapaPeso = {};
    productosPorPeso.forEach(p => {
      mapaPeso[p.nombre] = p.precio_kg_bs;
    });

    // Consulta SQL corregida: concatena la cantidad sin formatear y luego JS la arregla
    const todasVentasRaw = await window.parent.electronAPI.db.ejecutarConsulta(
      `SELECT v.id, v.fecha, v.cliente, v.total_bs, v.total_usd, v.metodo, v.tasa_momento, v.fiado_id, v.monto_recibido,
              v.vuelto, v.vuelto_entregado, v.vuelto_metodo,
              (SELECT group_concat(
                  CASE
                      WHEN (SELECT p.es_por_peso FROM productos p WHERE p.nombre = vd.producto LIMIT 1) = 1
                      THEN vd.producto || ' (' || vd.cantidad || ' kg)'
                      ELSE vd.producto || ' (x' || vd.cantidad || ')'
                  END, ', ')
               FROM ventas_detalle vd WHERE vd.venta_id = v.id) as productos
       FROM ventas v WHERE date(v.fecha) = ? ORDER BY v.fecha ASC`, [fecha]);

    // Aplicar formateo a los productos de cada venta
    todasVentasRaw.forEach(v => {
      v.productos = formatearTextoProductos(v.productos);
    });

    const rawVentasNormales = todasVentasRaw.filter(v => !v.fiado_id || v.fiado_id === 0);
    const rawAbonos = todasVentasRaw.filter(v => v.fiado_id > 0 && v.metodo.includes('Abono'));
    const rawPagos = todasVentasRaw.filter(v => v.fiado_id > 0 && (v.metodo.includes('Pago Fiado') || v.metodo.includes('Cobro Fiado')));

    const ventasAgrupadas = agruparTransacciones(rawVentasNormales);
    const abonosAgrupados = agruparTransacciones(rawAbonos);
    const pagosAgrupados = agruparTransacciones(rawPagos);

    const container = document.createElement('div');
    container.style.cssText = 'padding:15px; font-family: Arial; font-size: 7.5px; color: #1e293b;';
    let html = `
      <div style="text-align:center; margin-bottom:12px; border-bottom:2px solid #2563eb; padding-bottom:8px;">
        <h1 style="font-size:15px; font-weight:900; color:#1e40af; margin:0;">REPORTE DIARIO DE NEGOCIO</h1>
        <p style="font-size:10px; color:#64748b; margin:3px 0;">Fecha: <b>${escapeHtml(fecha)}</b> | Tasa del día: <b>Bs ${tasaActual.toLocaleString('es-VE',{minimumFractionDigits:2, maximumFractionDigits:2})}</b></p>
      </div>`;

    if (ventasAgrupadas.length > 0) {
      html += generarTablaVentasConDesglose(ventasAgrupadas, '📦 VENTAS DEL DÍA', '#1e40af', '#eff6ff', tasaActual);
    }
    if (pagosAgrupados.length > 0) {
      html += generarTablaAbonosAgrupados(pagosAgrupados, '✅ PAGOS DE FIADOS (COMPLETOS)', '#059669', '#ecfdf5', tasaActual);
    }
    if (abonosAgrupados.length > 0) {
      html += generarTablaAbonosAgrupados(abonosAgrupados, '💳 ABONOS A FIADOS (PARCIALES)', '#7c3aed', '#f5f3ff', tasaActual);
    }
    if (datos.fiados && datos.fiados.length > 0) {
      html += generarTablaFiados(datos.fiados, '📝 FIADOS REGISTRADOS / PENDIENTES', '#d97706', '#fffbeb', tasaActual, mapaPeso);
    }
    if (datos.gastos && datos.gastos.length > 0) {
      html += generarTablaGastos(datos.gastos, '💸 GASTOS DEL DÍA', '#e11d48', '#fff1f2', tasaActual);
    }

    let netoBs = 0, netoUsd = 0;
    ventasAgrupadas.forEach(v => { netoBs += v.total_bs; netoUsd += v.total_usd; });
    pagosAgrupados.forEach(v => { netoBs += v.total_bs; netoUsd += v.total_usd; });
    abonosAgrupados.forEach(v => { netoBs += v.total_bs; netoUsd += v.total_usd; });
    (datos.gastos || []).forEach(g => {
      if (esExtranjero(g.metodo)) {
        const valUsd = parseFloat(g.monto_usd || 0);
        if (valUsd > 0) {
          netoUsd -= valUsd;
        } else {
          const valBs = parseFloat(g.monto_bs || 0);
          netoUsd -= round2(valBs / tasaActual);
        }
      } else {
        netoBs -= (g.monto_bs || 0);
      }
    });

    html += `<div style="margin-top:10px; padding:8px; background:#f1f5f9; border-radius:6px; border:1px solid #cbd5e1; page-break-inside: avoid;">`;
    html += `<h2 style="font-size:10px; font-weight:900; color:#0f172a; margin:0 0 5px 0;">📊 RESUMEN NETO DEL DÍA</h2>`;
    html += `<p style="font-size:9px; font-weight:900; color:#1e40af; margin:2px 0;">💰 Neto Bolívares: <b>Bs ${netoBs.toLocaleString('es-VE',{minimumFractionDigits:2})}</b></p>`;
    html += `<p style="font-size:9px; font-weight:900; color:#7c3aed; margin:2px 0;">💵 Neto Dólares/Crypto: <b>$ ${formatearMontoExtranjeroVisual(netoUsd)}</b></p>`;
    html += `</div>`;
    html += `<div style="text-align:center; margin-top:15px; font-size:7px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px;">
      Reporte generado el ${new Date().toLocaleString('es-VE')} | Tasa referencia: Bs ${tasaActual.toLocaleString('es-VE',{minimumFractionDigits:2, maximumFractionDigits:2})}
    </div>`;
    html += `<style>
      tr { page-break-inside: avoid; }
      table { page-break-inside: avoid; }
    </style>`;
    container.innerHTML = html;
    const pdfBase64 = await html2pdf().set({
      margin: [5, 5, 5, 5],
      filename: `Reporte_${fecha}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).outputPdf('datauristring');
    const result = await window.parent.electronAPI.utils.guardarPDF(`Reporte_${fecha}.pdf`, pdfBase64.split(',')[1]);
    window.parent.Swal.close();
    if (result && result.success) {
      window.parent.Swal.fire({ icon: 'success', title: 'Reporte Generado', text: `Guardado correctamente.`, confirmButtonColor: '#2563eb' });
    } else {
      window.parent.Swal.fire({ icon: 'info', title: 'Cancelado', text: 'No se guardó el reporte.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
    }
  } catch (error) {
    window.parent.Swal.close();
    window.parent.Swal.fire({ icon: 'error', title: 'Error al generar el PDF', text: error.message, confirmButtonColor: '#dc2626' });
  }
}

function generarTablaVentasConDesglose(ventasAgrupadas, titulo, colorTitulo, colorBg, tasaActual) {
  let html = `<h2 style="font-size:10px; font-weight:900; color:${colorTitulo}; background:${colorBg}; padding:4px 8px; border-radius:4px; margin-bottom:5px;">${escapeHtml(titulo)} (${ventasAgrupadas.length})</h2>`;
  html += `<table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <thead><tr style="background:#f1f5f9;">
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Hora</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Cliente</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Productos</th>
      <th style="text-align:right;padding:3px 4px;border:1px solid #cbd5e1;">Total Bs</th>
      <th style="text-align:right;padding:3px 4px;border:1px solid #cbd5e1;">Total USD</th>
      <th style="text-align:right;padding:3px 4px;border:1px solid #cbd5e1;">Tasa</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Método</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Vuelto</th>
    </tr></thead>
    <tbody>`;
  let totalBs = 0, totalUsd = 0;
  ventasAgrupadas.forEach(v => {
    const { hora } = formatearFecha(v.fecha);
    const tasaVenta = (v.tasa_momento && parseFloat(v.tasa_momento) > 0) ? parseFloat(v.tasa_momento) : tasaActual;
    const metodoMostrar = formatearNombresMetodos(v.metodos);
    totalBs += v.total_bs;
    totalUsd += v.total_usd;
    const vueltoTexto = formatearVuelto(v.vuelto, v.vuelto_entregado, v.vuelto_metodo, tasaVenta);
    html += `<tr>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(hora)}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(v.cliente||'-')}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(v.productos||'-')}</td>
      <td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;font-weight:bold;">${v.total_bs > 0 ? 'Bs ' + v.total_bs.toLocaleString('es-VE',{minimumFractionDigits:2}) : ''}</td>
      <td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;font-weight:bold;">${v.total_usd > 0 ? '$ ' + formatearMontoExtranjeroVisual(v.total_usd) : ''}</td>
      <td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;">${tasaVenta.toLocaleString('es-VE',{minimumFractionDigits:2})}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:7px;">${escapeHtml(metodoMostrar)}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:7px;">${escapeHtml(vueltoTexto || '-')}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  if (totalBs > 0 || totalUsd > 0) {
    html += `<div style="display:flex; gap:8px; margin-bottom:10px; font-size:8px;">`;
    if (totalBs > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total Bs:</b> ${totalBs.toLocaleString('es-VE',{minimumFractionDigits:2})} Bs</div>`;
    if (totalUsd > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total $:</b> ${formatearMontoExtranjeroVisual(totalUsd)} $</div>`;
    html += `</div>`;
  }
  return html;
}

function generarTablaAbonosAgrupados(transaccionesAgrupadas, titulo, colorTitulo, colorBg, tasaActual) {
  let html = `<h2 style="font-size:10px; font-weight:900; color:${colorTitulo}; background:${colorBg}; padding:4px 8px; border-radius:4px; margin-bottom:5px;">${escapeHtml(titulo)} (${transaccionesAgrupadas.length})</h2>`;
  html += `<table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <thead><tr style="background:#f1f5f9;">
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Hora</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Cliente</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Producto Pagado</th>
      <th style="text-align:right;padding:3px 4px;border:1px solid #cbd5e1;">Total Bs</th>
      <th style="text-align:right;padding:3px 4px;border:1px solid #cbd5e1;">Total USD</th>
      <th style="text-align:right;padding:3px 4px;border:1px solid #cbd5e1;">Tasa</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Método</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Vuelto</th>
    </tr></thead>
    <tbody>`;
  let totalBs = 0, totalUsd = 0;
  transaccionesAgrupadas.forEach(v => {
    const { hora } = formatearFecha(v.fecha);
    const tasaVenta = (v.tasa_momento && parseFloat(v.tasa_momento) > 0) ? parseFloat(v.tasa_momento) : tasaActual;
    const metodoMostrar = formatearNombresMetodos(v.metodos);
    totalBs += v.total_bs;
    totalUsd += v.total_usd;
    const vueltoTexto = formatearVuelto(v.vuelto, v.vuelto_entregado, v.vuelto_metodo, tasaVenta);
    html += `<tr>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(hora)}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(v.cliente||'-')}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(v.productos||'-')}</td>
      <td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;font-weight:bold;">${v.total_bs > 0 ? 'Bs ' + v.total_bs.toLocaleString('es-VE',{minimumFractionDigits:2}) : ''}</td>
      <td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;font-weight:bold;">${v.total_usd > 0 ? '$ ' + formatearMontoExtranjeroVisual(v.total_usd) : ''}</td>
      <td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;">${tasaVenta.toLocaleString('es-VE',{minimumFractionDigits:2})}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:7px;">${escapeHtml(metodoMostrar)}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:7px;">${escapeHtml(vueltoTexto || '-')}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  if (totalBs > 0 || totalUsd > 0) {
    html += `<div style="display:flex; gap:8px; margin-bottom:10px; font-size:8px;">`;
    if (totalBs > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total Bs:</b> ${totalBs.toLocaleString('es-VE',{minimumFractionDigits:2})} Bs</div>`;
    if (totalUsd > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total $:</b> ${formatearMontoExtranjeroVisual(totalUsd)} $</div>`;
    html += `</div>`;
  }
  return html;
}

function generarTablaFiados(fiados, titulo, colorTitulo, colorBg, tasaActual, mapaPeso) {
  let html = `<h2 style="font-size:10px; font-weight:900; color:${colorTitulo}; background:${colorBg}; padding:4px 8px; border-radius:4px; margin-bottom:5px;">${escapeHtml(titulo)} (${fiados.length})</h2>`;
  html += `<table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <thead><tr style="background:#f1f5f9;">
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Hora</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Cliente</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Productos</th>
      <th style="text-align:center;padding:3px 4px;border:1px solid #cbd5e1;">Estado</th>
    </tr></thead>
    <tbody>`;
  let totalBs = 0, totalUsd = 0;
  fiados.forEach(f => {
    const { hora } = formatearFecha(f.fecha);
    let productosFormateados = escapeHtml(f.productos || '');
    if (f.detalle_productos) {
      const detalles = f.detalle_productos.split(';;').map(d => {
        const partes = d.split('|');
        return {
          nombre: partes[0] || '',
          cantidad: parseFloat(partes[1]) || 0,
          precioBs: parseFloat(partes[2]) || 0,
          precioUsd: parseFloat(partes[3]) || 0,
          cantidadAbonada: parseFloat(partes[4]) || 0,
          cantidadPagadaEnTotal: parseFloat(partes[5]) || 0,
          estado: partes[6] || 'PENDIENTE'
        };
      });
      productosFormateados = detalles.map(d => {
        let cantidadMostrar = `x${d.cantidad}`;
        if (mapaPeso && mapaPeso[d.nombre] !== undefined) {
          const peso = d.cantidad;
          cantidadMostrar = (peso % 1 === 0) ? peso + ' kg' : peso.toFixed(3).replace(/\.?0+$/, '') + ' kg';
        } else {
          cantidadMostrar = `x${d.cantidad % 1 === 0 ? Math.floor(d.cantidad) : d.cantidad}`;
        }
        let texto = `${escapeHtml(d.nombre)} (${cantidadMostrar})`;
        if (d.estado === 'MIXTO') {
          texto += ` - Abonado: ${d.cantidadAbonada}, Pagado: ${d.cantidadPagadaEnTotal}`;
        } else if (d.estado === 'ABONADO') {
          texto += ` - Abonado: ${d.cantidadAbonada} de ${d.cantidad}`;
        } else if (d.estado === 'PAGADO') {
          texto += ` - Pagado`;
        }
        let color = '#dc2626';
        if (d.estado === 'ABONADO') color = '#d97706';
        else if (d.estado === 'PAGADO') color = '#16a34a';
        else if (d.estado === 'MIXTO') color = '#9333ea';
        return `<span style="color:${color};">${texto}</span>`;
      }).join(', ');
    }
    totalBs += (f.total_bs || 0);
    totalUsd += (f.total_usd || 0);
    html += `<tr>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(hora)}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(f.cliente||'-')}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:7px;">${productosFormateados}</td>
      <td style="text-align:center;padding:2px 4px;border:1px solid #e2e8f0;">${f.pagado?'✅ Pagado':'⏳ Pendiente'}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  if (totalBs > 0 || totalUsd > 0) {
    html += `<div style="display:flex; gap:8px; margin-bottom:10px; font-size:8px;">`;
    if (totalBs > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total Bs:</b> ${totalBs.toLocaleString('es-VE',{minimumFractionDigits:2})} Bs</div>`;
    if (totalUsd > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total $:</b> ${formatearMontoExtranjeroVisual(totalUsd)} $</div>`;
    html += `</div>`;
  }
  return html;
}

function generarTablaGastos(gastos, titulo, colorTitulo, colorBg, tasaActual) {
  let html = `<h2 style="font-size:10px; font-weight:900; color:${colorTitulo}; background:${colorBg}; padding:4px 8px; border-radius:4px; margin-bottom:5px;">${escapeHtml(titulo)} (${gastos.length})</h2>`;
  let totalBs = 0, totalUsd = 0;
  html += `<table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <thead><tr style="background:#f1f5f9;">
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Hora</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Descripción</th>
      <th style="text-align:right;padding:3px 4px;border:1px solid #cbd5e1;">Monto</th>
      <th style="text-align:left;padding:3px 4px;border:1px solid #cbd5e1;">Método</th>
    </tr></thead>
    <tbody>`;
  gastos.forEach(g => {
    const { hora } = formatearFecha(g.fecha);
    const esExt = esExtranjero(g.metodo);
    let montoMostrar = '';
    if (esExt) {
      const valUsd = parseFloat(g.monto_usd || 0);
      if (valUsd > 0) {
        montoMostrar = `$ ${formatearMontoExtranjeroVisual(valUsd)}`;
        totalUsd += valUsd;
      } else {
        const valBs = parseFloat(g.monto_bs || 0);
        if (valBs > 0) {
          const convertido = valBs / tasaActual;   // ← CORREGIDO (sin round2)
          montoMostrar = `$ ${formatearMontoExtranjeroVisual(convertido)}`;
          totalUsd += convertido;
        } else {
          montoMostrar = `$ 0,00`;
        }
      }
    } else {
      const val = parseFloat(g.monto_bs || 0);
      totalBs += val;
      montoMostrar = `Bs ${val.toLocaleString('es-VE',{minimumFractionDigits:2})}`;
    }
    html += `<tr>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(hora)}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;">${escapeHtml(g.descripcion)}</td>
      <td style="text-align:right;padding:2px 4px;border:1px solid #e2e8f0;font-weight:bold;">${montoMostrar}</td>
      <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:7px;">${escapeHtml(g.metodo)}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  if (totalBs > 0 || totalUsd > 0) {
    html += `<div style="display:flex; gap:8px; margin-bottom:10px; font-size:8px;">`;
    if (totalBs > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total gastos Bs:</b> ${totalBs.toLocaleString('es-VE',{minimumFractionDigits:2})} Bs</div>`;
    if (totalUsd > 0) html += `<div style="flex:1;background:${colorBg};padding:5px;border-radius:4px;"><b>Total gastos $:</b> ${formatearMontoExtranjeroVisual(totalUsd)} $</div>`;
    html += `</div>`;
  }
  return html;
}

window.generarReporte = generarReporte;
init();
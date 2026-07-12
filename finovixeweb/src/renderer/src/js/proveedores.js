let editingId = null;

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function cargarProveedores(filtro = "") {
  try {
    const data = await window.parent.electronAPI.db.buscarProveedores(filtro);
    const container = document.getElementById('prov-container');
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-center text-slate-500 mt-10 text-[13px]">No hay proveedores registrados.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    data.forEach((p, index) => {
      const inicial = escapeHtml(p.nombre.charAt(0).toUpperCase());
      const nombre = escapeHtml(p.nombre);
      const contacto = escapeHtml(p.contacto || '---');
      const productos = escapeHtml(p.productos || '---');
      const card = document.createElement('div');
      card.className = "prov-card flex flex-col sm:flex-row sm:items-center justify-between gap-4";
      card.style.animationDelay = `${index * 0.05}s`;
      card.innerHTML = `
        <div class="flex items-center gap-4">
          <div class="avatar-prov">${inicial}</div>
          <div class="flex-1 min-w-0">
            <h3 class="text-[15px] font-bold text-slate-800">${nombre}</h3>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
              <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>${contacto}</span>
              <span class="flex items-center gap-1"><svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>${productos}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button onclick="abrirModal(${p.id}, '${nombre.replace(/'/g, "\\'")}', '${contacto.replace(/'/g, "\\'")}', '${productos.replace(/'/g, "\\'")}')" class="action-btn btn-editar">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>Editar
          </button>
          <button onclick="eliminarProv(${p.id})" class="action-btn btn-eliminar">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Eliminar
          </button>
        </div>`;
      fragment.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
  } catch (e) {}
}

function abrirModal(id = null, nombre = "", contacto = "", productos = "") {
  editingId = id;
  document.getElementById('m-nombre').value = nombre;
  document.getElementById('m-contacto').value = contacto;
  const contProd = document.getElementById('m-productos');
  contProd.innerHTML = '';
  const prods = productos ? productos.split(', ') : [""];
  prods.forEach(p => agregarCampoProd(p));
  document.getElementById('modal-prov').classList.remove('hidden');
}

function agregarCampoProd(val = "") {
  const div = document.createElement('div');
  div.className = "flex gap-2 items-center";
  const valorEscapado = escapeHtml(val);
  div.innerHTML = `<input type="text" value="${valorEscapado}" class="prod-input w-full h-9 px-3 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="Producto o categoría..."><button onclick="this.parentElement.remove()" class="w-8 h-9 bg-red-50 hover:bg-red-100 text-red-500 font-bold rounded-lg transition-colors">X</button>`;
  document.getElementById('m-productos').appendChild(div);
}

async function guardarProveedor() {
  const nombre = document.getElementById('m-nombre').value.trim();
  if (!nombre) return window.parent.Swal.fire({ icon: 'warning', title: 'Campo Requerido', text: 'El nombre es obligatorio.', confirmButtonColor: '#2563eb' });
  const data = {
    id: editingId,
    nombre: nombre,
    contacto: document.getElementById('m-contacto').value.trim(),
    productos: Array.from(document.querySelectorAll('.prod-input')).map(i => i.value.trim()).filter(v => v !== "").join(', ')
  };
  try {
    await window.parent.electronAPI.db.guardarProveedor(data);
    window.parent.Swal.fire({ icon: 'success', title: editingId ? 'Actualizado' : 'Guardado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    cerrarModal(); cargarProveedores(document.getElementById('buscar-prov').value);
  } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message, confirmButtonColor: '#dc2626' }); }
}

async function eliminarProv(id) {
  if ((await window.parent.Swal.fire({ title: '¿Eliminar Proveedor?', text: "Se borrará permanentemente.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'Sí, eliminar' })).isConfirmed) {
    try {
      await window.parent.electronAPI.db.eliminarProveedor(id);
      window.parent.Swal.fire({ icon: 'success', title: 'Proveedor eliminado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
      cargarProveedores(document.getElementById('buscar-prov').value);
    } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message, confirmButtonColor: '#dc2626' }); }
  }
}

Object.assign(window, { abrirModal, eliminarProv, cerrarModal: () => document.getElementById('modal-prov').classList.add('hidden'), agregarCampoProd, guardarProveedor });
document.getElementById('buscar-prov').addEventListener('keyup', (e) => cargarProveedores(e.target.value));
cargarProveedores();
Swal.mixin({ heightAuto: false, scrollbarPadding: false });

const sesionActual = JSON.parse(localStorage.getItem('currentUser')) || { id: 0, rol: 'vendedor' };

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function init() {
  await cargarTasaActual();
  await cargarMiPerfil();
  if (sesionActual.rol !== 'admin') {
    ['cfg-tasa', 'cfg-modo', 'mi-nombre', 'mi-usuario', 'mi-pass'].forEach(id => document.getElementById(id).disabled = true);
    document.getElementById('btn-guardar-tasa').classList.add('hidden');
    document.querySelector('button[onclick="actualizarPerfil()"]')?.classList.add('hidden');
  } else {
    document.getElementById('panel-add-user').classList.remove('hidden');
    document.getElementById('new-rol').addEventListener('change', e => document.getElementById('panel-permisos').classList.toggle('hidden', e.target.value !== 'vendedor'));
  }
  cargarUsuarios();
}

async function cargarTasaActual() {
  const [tasa, modo] = await Promise.all([window.parent.electronAPI.db.obtenerConfig('tasa_usd'), window.parent.electronAPI.db.obtenerConfig('modo_tasa')]);
  if (tasa) document.getElementById('cfg-tasa').value = parseFloat(tasa).toFixed(2);
  if (modo) document.getElementById('cfg-modo').value = modo;
}

async function guardarTasa() {
  if (sesionActual.rol !== 'admin') return window.parent.Swal.fire({ icon: 'error', title: 'Acceso Denegado' });
  const btn = document.getElementById('btn-guardar-tasa'), modo = document.getElementById('cfg-modo').value;
  btn.textContent = "⏳ Procesando..."; btn.disabled = true;
  try {
    const esManual = (modo !== "Automático (BCV)");
    const tasa = !esManual ? parseFloat(await window.parent.electronAPI.utils.obtenerTasaBCV()) : parseFloat(document.getElementById('cfg-tasa').value);
    if (!tasa || tasa <= 0) throw new Error("Tasa inválida.");
    await window.parent.electronAPI.db.actualizarTasaYPrecios(tasa, esManual);
    document.getElementById('cfg-tasa').value = tasa.toFixed(2);
    if (window.parent && window.parent.electronAPI && window.parent.electronAPI.actualizarTasaDisplay) {
      window.parent.electronAPI.actualizarTasaDisplay(tasa.toFixed(2));
    }
    window.parent.Swal.fire({ icon: 'success', title: 'Tasa Actualizada', text: `${modo} fijada en: ${tasa.toFixed(2)} Bs.` });
  } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Error', text: e.message }); } finally { btn.textContent = "💾 Guardar Tasa"; btn.disabled = false; }
}

async function crearCopiaSeguridad() {
  if (sesionActual.rol !== 'admin') return window.parent.Swal.fire({ icon: 'error', title: 'Acceso Denegado' });
  const result = await window.parent.electronAPI.db.crearRespaldo();
  if (result && result.success) {
    window.parent.Swal.fire({ icon: 'success', title: 'Copia Creada', text: 'El respaldo se ha guardado correctamente.' });
  } else if (result && result.error) {
    window.parent.Swal.fire({ icon: 'error', title: 'Fallo al respaldar', text: result.error });
  }
}

async function restaurarSistema() {
  if (sesionActual.rol !== 'admin') return window.parent.Swal.fire({ icon: 'error', title: 'Acceso Denegado' });
  const confirmacion = await window.parent.Swal.fire({
    title: '¿Restaurar Sistema?',
    text: "La información actual será reemplazada. El sistema se reiniciará al finalizar. ¿Deseas continuar?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, buscar archivo'
  });
  if (confirmacion.isConfirmed) {
    const result = await window.parent.electronAPI.db.restaurarRespaldo();
    if (result && result.error) {
      window.parent.Swal.fire({ icon: 'error', title: 'Error al Restaurar', text: result.error });
    } else if (result && result.success) {
      window.parent.Swal.fire({
        icon: 'success',
        title: 'Restauración exitosa',
        text: 'El sistema se reiniciará...',
        timer: 2000,
        showConfirmButton: false
      });
    }
  }
}

async function cargarMiPerfil() {
  const users = await window.parent.electronAPI.db.obtenerUsuarios();
  const u = users.find(x => String(x.id) === String(sesionActual.id));
  if (u) { document.getElementById('mi-nombre').value = u.nombre; document.getElementById('mi-usuario').value = u.usuario; }
}

async function actualizarPerfil() {
  const nom = document.getElementById('mi-nombre').value.trim(), usr = document.getElementById('mi-usuario').value.trim(), pwd = document.getElementById('mi-pass').value.trim() || null;
  if (!nom || !usr) return window.parent.Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
  if (await window.parent.electronAPI.db.actualizarPerfil(sesionActual.id, nom, usr, pwd)) {
    window.parent.Swal.fire({ icon: 'success', title: 'Perfil actualizado', toast: true, position: 'top-end', timer: 2500 });
    document.getElementById('mi-pass').value = '';
    Object.assign(sesionActual, { nombre: nom, usuario: usr });
    localStorage.setItem('currentUser', JSON.stringify(sesionActual));
    cargarUsuarios();
  }
}

async function agregarUsuario() {
  const n = document.getElementById('new-nombre').value.trim(), u = document.getElementById('new-usuario').value.trim(), p = document.getElementById('new-pass').value.trim(), r = document.getElementById('new-rol').value;
  const perms = r === 'vendedor' ? Array.from(document.querySelectorAll('.permiso-cb:checked')).map(cb => cb.value).join(',') : "todas";
  if (!n || !u || !p || (r === 'vendedor' && !perms)) return window.parent.Swal.fire({ icon: 'warning', title: 'Campos incompletos' });
  try {
    await window.parent.electronAPI.db.agregarUsuario(n, u, p, r, perms);
    window.parent.Swal.fire({ icon: 'success', title: 'Usuario Creado', toast: true, position: 'top-end', timer: 2500 });
    ['new-nombre', 'new-usuario', 'new-pass'].forEach(id => document.getElementById(id).value = '');
    cargarUsuarios();
  } catch (e) { window.parent.Swal.fire({ icon: 'error', title: 'Fallo al crear', text: e.message }); }
}

async function cargarUsuarios() {
  const users = await window.parent.electronAPI.db.obtenerUsuarios();
  document.getElementById('users-container').innerHTML = users.map(u => {
    const esActual = String(u.id) === String(sesionActual.id), isDel = sesionActual.rol === 'admin' && u.usuario !== 'admin' && !esActual;
    return `<div class="grid grid-cols-5 p-3 items-center border-b border-slate-100 hover:bg-slate-50 transition-colors text-sm"><div class="col-span-1 font-bold text-zinc-800">${escapeHtml(u.nombre.toUpperCase())}</div><div class="col-span-1 text-slate-600">${escapeHtml(u.usuario)}</div><div class="col-span-1 font-bold ${u.rol==='admin'?'text-blue-600':'text-slate-600'}">${escapeHtml(u.rol.toUpperCase())}</div><div class="col-span-1 text-slate-500 text-[12px]">${escapeHtml(u.ultimo_login || '---')}</div><div class="col-span-1 text-right">${isDel ? `<button onclick="eliminarUsr(${u.id})" class="px-4 py-1.5 bg-red-50 text-red-500 font-bold rounded-lg hover:bg-red-100 transition-colors">Eliminar</button>` : `<span class="text-[11px] italic text-slate-400 font-bold px-4 py-2">${esActual ? 'Actual' : 'Protegido'}</span>`}</div></div>`;
  }).join('');
}

async function eliminarUsr(id) {
  if ((await window.parent.Swal.fire({ title: '¿Eliminar Operador?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })).isConfirmed) {
    await window.parent.electronAPI.db.eliminarUsuario(id);
    cargarUsuarios();
  }
}

Object.assign(window, { eliminarUsr, agregarUsuario, actualizarPerfil, guardarTasa, crearCopiaSeguridad, restaurarSistema });

init();
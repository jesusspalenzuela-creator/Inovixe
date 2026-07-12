// src/renderer/src/js/login.js
let currentUser = null;

async function intentarLogin() {
    const userInput = document.getElementById('user');
    const passInput = document.getElementById('password');
    const btnLogin = document.getElementById('btn-login');

    const usuario = userInput.value.trim();
    const password = passInput.value.trim();

    if (!usuario || !password) {
        Swal.fire({
            icon: 'warning',
            title: 'Campos vacíos',
            text: 'Por favor completa todos los campos',
            confirmButtonColor: '#2563eb'
        }).then(() => userInput.focus());
        return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = "Verificando...";

    try {
        const resultado = await window.electronAPI.db.validarLogin(usuario, password);

        if (resultado && resultado.id) {
            currentUser = resultado;
            localStorage.setItem('currentUser', JSON.stringify(resultado));
            window.location.href = 'home.html';
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Acceso Denegado',
                text: 'Usuario o contraseña incorrectos',
                confirmButtonColor: '#dc2626'
            }).then(() => resetearFormulario());
        }
    } catch (error) {
        console.error('Error durante login:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error Crítico',
            text: 'No se pudo conectar con la base de datos',
            confirmButtonColor: '#dc2626'
        }).then(() => resetearFormulario());
    }
}

function resetearFormulario() {
    const btnLogin = document.getElementById('btn-login');
    btnLogin.disabled = false;
    btnLogin.textContent = "INGRESAR AL SISTEMA";
    document.getElementById('password').value = '';
    document.getElementById('user').focus();
    window.focus();
}

document.addEventListener('DOMContentLoaded', () => {
    const passInput = document.getElementById('password');
    if (passInput) {
        passInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') intentarLogin();
        });
    }
});

window.intentarLogin = intentarLogin;
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    loadPageContent();
});


async function checkAuth() {
    const token = localStorage.getItem('token');
    const publicPages = ['/', '/signup'];
    const currentPath = window.location.pathname;

    if (token) {
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            console.log('Status da verificação:', response.status);

            if (!response.ok) {
                console.error('Erro na resposta:', await response.json());
                if (!publicPages.includes(currentPath)) window.location.href = '/';
                return;
            }

            const user = await response.json();
            if (publicPages.includes(currentPath)) window.location.href = '/main';

        } catch (error) {
            console.error('Erro na verificação:', error);
            if (!publicPages.includes(currentPath)) window.location.href = '/';
        }
    } else if (!publicPages.includes(currentPath)) {
        window.location.href = '/';
    }
}

function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) loginForm.addEventListener('submit', (e) => handleLogin(e));
    if (registerForm) registerForm.addEventListener('submit', (e) => handleRegister(e));
}

async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.querySelector('#email').value;
    const password = form.querySelector('#password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            console.log('Login bem-sucedido:', data);
            alert('Login bem-sucedido');
            window.location.href = '/main';
        } else {
            const errorData = await response.json();
            showError(errorData.error || 'Credenciais inválidas');
        }
    } catch (error) {
        showError('Erro de conexão');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.querySelector('#name').value;
    const username = form.querySelector('#username').value;
    const email = form.querySelector('#email').value;
    const password = form.querySelector('#password').value;
    const confirmPassword = form.querySelector('#confirmPassword').value;

    if (password.length < 6) {
        showError('A senha deve ter pelo menos 6 caracteres');
        return;
    }

    if (password !== confirmPassword) {
        showError('Senhas não coincidem');
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, email, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token); 
            alert('Cadastro realizado! Faça login.');
            window.location.href = '/';
        } else {
            const errorData = await response.json();
            showError(errorData.error || 'Erro no cadastro');
        }
    } catch (error) {
        showError('Erro de conexão');
    }
}

async function loadPageContent() {
    const path = window.location.pathname;
    const token = localStorage.getItem('token');

    if (path === '/main') {
        await loadUserData(token);
        await loadGoals(token);
        await loadRanking(token);
    }

    if (path === '/dashboard') {
        await loadDashboardStats(token);
        await loadGoals(token);
    }

    if (path === '/ranking') await loadFullRanking(token);
}

async function loadUserData(token) {
    try {
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao carregar dados');

        const user = await response.json();
        const greeting = document.querySelector('.greeting');
        if (greeting) greeting.textContent = `Olá, ${user.name}!`;
    } catch (error) {
        showError('Erro ao carregar dados');
    }
}

async function loadGoals(token) {
    try {
        const response = await fetch('/api/goals', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao carregar metas');

        const goals = await response.json();
        const container = document.querySelector('.goal-list');
        if (container) {
            container.innerHTML = goals.map(goal => `
                <div class="goal-item">
                    <h3>${goal.title}</h3>
                    <p>${goal.description}</p>
                    <p>Status: ${goal.status}</p>
                </div>
            `).join('');
        }
    } catch (error) {
        showError('Falha ao carregar metas');
    }
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/stats', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Falha ao carregar estatísticas');

        const stats = await response.json();
        updateDashboardStats(stats);
    } catch (error) {
        showError('Falha ao carregar estatísticas');
    }
}

function updateDashboardStats(stats) {
    const container = document.querySelector('.stats-container');
    if (container) {
        container.innerHTML = `
            <div class="stat-card">
                <h3>Metas Concluídas</h3>
                <p class="stat-number">${stats.completed || 0}</p>
            </div>
            <div class="stat-card">
                <h3>Metas em Andamento</h3>
                <p class="stat-number">${stats.in_progress || 0}</p>
            </div>
            <div class="stat-card">
                <h3>Metas Criadas</h3>
                <p class="stat-number">${stats.total || 0}</p>
            </div>
        `;
    }
}

async function loadRanking() {
    try {
        const response = await fetch('/api/ranking', { headers: { 'Authorization': `Bearer ${token}` }});
        if (!response.ok) throw new Error('Falha ao carregar ranking');

        const { ranking, position } = await response.json();
        updateRanking(ranking, position);
    } catch (error) {
        showError('Falha ao carregar ranking');
    }
}

async function loadFullRanking() {
    try {
        const response = await fetch('/api/ranking', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Falha ao carregar ranking completo');

        const { ranking, position } = await response.json();
        updateFullRanking(ranking, position);
    } catch (error) {
        showError('Falha ao carregar ranking');
    }
}

function updateRanking(ranking, position) {
    const container = document.querySelector('.ranking-list');
    if (container) {
        container.innerHTML = ranking.map((user, index) => `
            <div class="ranking-item">
                <span class="position">${index + 1}°</span>
                <span class="username">${user.username}</span>
                <span class="points">${user.points} pts</span>
            </div>
        `).join('');
    }
}

function updateFullRanking(ranking, userPosition) {
    updateRanking(ranking); 
    const positionElement = document.querySelector('.user-position');
    if (positionElement) {
        positionElement.innerHTML = `<p>Você está em ${userPosition}º posição</p>`;
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.color = 'red';
    errorDiv.style.margin = '10px 0';

    document.querySelector('main')?.prepend(errorDiv);
}


function handleLogout() {
    localStorage.removeItem('token'); 
    window.location.href = '/';
}
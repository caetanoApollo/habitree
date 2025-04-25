require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');

const app = express();

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    console.log('authHeader:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer')) {
        console.log('authHeader:', authHeader);
        return res.status(401).json({ error: 'Não autenticado, erro no authHeader' });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        console.log('authHeader:', authHeader);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await pool.query('SELECT id, username, email FROM users WHERE id = ?', [decoded.id]);

        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        req.user = rows[0];
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, username, email, password } = req.body;

        if (!name || !username || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
        }

        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'E-mail ou usuário já cadastrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await pool.query(
            'INSERT INTO users (name, username, email, password) VALUES (?, ?, ?, ?)',
            [name, username, email, hashedPassword]
        );

        const token = jwt.sign(
            { id: result.insertId, username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(201).json({ 
            message: 'Usuário registrado com sucesso',
            token 
        });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Credenciais inválidas' });

        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email
            },
            token 
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
    res.json(req.user);
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logout realizado' });
});

app.get('/api/goals', authenticate, async (req, res) => {
    try {
        const [goals] = await pool.query(
            'SELECT * FROM goals WHERE user_id = ?',
            [req.user.id]
        );
        res.json(goals);
    } catch (error) {
        console.error('Erro ao buscar metas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/main', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/main.html'));
});

app.get('/dashboard', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/signup.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
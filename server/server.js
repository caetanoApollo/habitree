require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');
const cron = require('node-cron');

const app = express();

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use((req, res, next) => {
    console.log('Headers recebidos:', req.headers);
    next();
});

const authenticate = async (req, res, next) => {
    console.log('Rota acessada:', req.path); // Debug
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        console.error('Cabeçalho Authorization ausente');
        return res.status(401).json({ error: 'Não autenticado, cabeçalho Authorization ausente' });
    }

    if (!authHeader.startsWith('Bearer ')) {
        console.error('Formato de token inválido');
        return res.status(401).json({ error: 'Formato de token inválido' });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [rows] = await pool.query(
            'SELECT id, name, username, email FROM users WHERE id = ?', 
            [decoded.id]
        );

        if (!rows.length) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        req.user = rows[0];
        next();
    } catch (error) {
        console.error('Erro na autenticação:', error.message);
        res.status(401).json({ error: 'Token inválido ou expirado' });
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

        console.log('User object:', user);

        res.json({
            user: {
                id: user.id,
                name: user.name || "Nome não disponível",
                username: user.username,
                email: user.email
            },
            token,
            redirect: req.query.redirect || '/main'
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/stats', authenticate, async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                COUNT(*) as total
            FROM goals 
            WHERE user_id = ?
        `, [req.user.id]);

        res.json(stats[0]);
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

app.post('/api/goals', authenticate, async (req, res) => {
    try {
        const { title, deadline, difficulty } = req.body;

        if (!title || !deadline || !difficulty) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        await pool.query(
            'INSERT INTO goals (user_id, title, deadline, difficulty, status, progress) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, title, deadline, difficulty, 'em andamento', 0]
        );

        res.status(201).json({ message: 'Meta criada com sucesso' });
    } catch (error) {
        console.error('Erro ao criar meta:', error);
        res.status(500).json({ error: 'Erro interno ao criar meta' });
    }
});

app.patch('/api/goals/:id/complete', authenticate, async (req, res) => {
    const goalId = req.params.id;
    const userId = req.user.id;

    try {
        // Verifica se a meta existe e pertence ao usuário
        const [rows] = await pool.query(
            'SELECT * FROM goals WHERE id = ? AND user_id = ?',
            [goalId, userId]
        );

        const goal = rows[0];
        if (!goal) return res.status(404).json({ error: 'Meta não encontrada' });

        if (goal.status === 'concluída') {
            return res.status(400).json({ error: 'Meta já concluída' });
        }

        // Atribui pontos com base na dificuldade
        let pontos = 0;
        if (goal.difficulty === 'fácil') pontos = 10;
        else if (goal.difficulty === 'média') pontos = 20;
        else if (goal.difficulty === 'difícil') pontos = 30;

        // Atualiza meta e pontos do usuário
        await pool.query('UPDATE goals SET status = ?, progress = 100 WHERE id = ?', ['concluída', goalId]);
        await pool.query('UPDATE users SET points = points + ? WHERE id = ?', [pontos, userId]);

        res.json({ message: 'Meta concluída e pontuação atualizada' });

    } catch (error) {
        console.error('Erro ao concluir meta:', error);
        res.status(500).json({ error: 'Erro ao concluir meta' });
    }
});

app.get('/api/ranking', authenticate, async (req, res) => {
    try {
        const [ranking] = await pool.query(
            'SELECT username, points FROM users ORDER BY points DESC LIMIT 10'
        );

        const [position] = await pool.query(
            `SELECT COUNT(*) AS position FROM users WHERE points > (
                SELECT points FROM users WHERE id = ?
            )`, [req.user.id]
        );

        res.json({
            ranking,
            position: position[0].position + 1
        });
    } catch (error) {
        console.error('Erro ao buscar ranking:', error);
        res.status(500).json({ error: 'Erro ao buscar ranking' });
    }
});


app.get('/api/auth/me', authenticate, async (req, res) => {
    console.log('Usuário autenticado:', req.user);
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

app.get('/ranking', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/ranking.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/signup.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

cron.schedule('0 0 * * *', async () => {
    try {
        const [expiredGoals] = await pool.query(
            'SELECT id FROM goals WHERE deadline < CURDATE() AND status = "em andamento"'
        );

        for (const goal of expiredGoals) {
            await pool.query('UPDATE goals SET progress = 0 WHERE id = ?', [goal.id]);
        }

        console.log(`Metas vencidas resetadas: ${expiredGoals.length}`);
    } catch (error) {
        console.error('Erro ao resetar metas vencidas:', error);
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
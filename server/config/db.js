require('dotenv').config(); // Carrega variáveis do .env
const mysql = require('mysql2/promise');

// Configuração do pool de conexão usando variáveis de ambiente
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost', 
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME || 'habitree',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Teste de conexão (opcional, mas útil para debug)
pool.getConnection()
    .then(conn => {
        console.log('Conexão com o banco de dados estabelecida!');
        conn.release();
    })
    .catch(err => {
        console.error('Erro ao conectar ao banco:', err);
    });

module.exports = pool;
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    })
  : new Pool({
      user: process.env.PGUSER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || 'base_shackleton',
      password: process.env.PGPASSWORD || 'postgres',
      port: process.env.PGPORT || 5432,
    });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/register', async (req, res) => {
  const { apodo, password } = req.body;
  if (!apodo || !password || apodo.trim().length < 2 || password.length < 4) {
    return res.status(400).json({ error: 'El apodo (mín. 2 letras) y la contraseña (mín. 4 caracteres) son obligatorios.' });
  }
  const cleanApodo = apodo.trim().toLowerCase();
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO usuarios (apodo, password_hash) VALUES ($1, $2) RETURNING id, apodo, mejor_puntaje',
      [cleanApodo, hash]
    );
    res.json({ user: result.rows[0], save: null });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese apodo ya está en uso. Elige otro.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno al crear usuario en PostgreSQL.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { apodo, password } = req.body;
  if (!apodo || !password) return res.status(400).json({ error: 'Completa apodo y contraseña.' });
  const cleanApodo = apodo.trim().toLowerCase();
  try {
    const userRes = await pool.query('SELECT * FROM usuarios WHERE apodo = $1', [cleanApodo]);
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'Apodo o contraseña incorrectos.' });
    const user = userRes.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Apodo o contraseña incorrectos.' });
    const saveRes = await pool.query('SELECT estado_json FROM partidas WHERE usuario_id = $1', [user.id]);
    res.json({
      user: { id: user.id, apodo: user.apodo, mejor_puntaje: user.mejor_puntaje },
      save: saveRes.rows.length > 0 ? saveRes.rows[0].estado_json : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error de conexión con la base de datos.' });
  }
});

app.post('/api/save', async (req, res) => {
  const { usuario_id, estado_json, mejor_puntaje } = req.body;
  if (!usuario_id || !estado_json) return res.status(400).json({ error: 'Datos incompletos' });
  try {
    await pool.query(
      `INSERT INTO partidas (usuario_id, estado_json, actualizado_en)
       VALUES ($1, $2, NOW())
       ON CONFLICT (usuario_id)
       DO UPDATE SET estado_json = EXCLUDED.estado_json, actualizado_en = NOW()`,
      [usuario_id, estado_json]
    );
    if (typeof mejor_puntaje === 'number') {
      await pool.query(
        'UPDATE usuarios SET mejor_puntaje = GREATEST(mejor_puntaje, $1) WHERE id = $2',
        [mejor_puntaje, usuario_id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar la partida.' });
  }
});

app.post('/api/clear-save', async (req, res) => {
  const { usuario_id, mejor_puntaje } = req.body;
  if (!usuario_id) return res.json({ ok: true });
  try {
    await pool.query('DELETE FROM partidas WHERE usuario_id = $1', [usuario_id]);
    if (typeof mejor_puntaje === 'number') {
      await pool.query(
        'UPDATE usuarios SET mejor_puntaje = GREATEST(mejor_puntaje, $1) WHERE id = $2',
        [mejor_puntaje, usuario_id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al limpiar partida.' });
  }
});

// En Vercel se exporta la app; en local se levanta el servidor normalmente.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Servidor Base Shackleton corriendo en http://localhost:${PORT}`));
}

module.exports = app;

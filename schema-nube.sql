-- Para Neon / Supabase (la base de datos ya existe, no hace falta CREATE DATABASE)
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    apodo VARCHAR(32) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    mejor_puntaje INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partidas (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    estado_json JSONB NOT NULL,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

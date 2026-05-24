// Pool Postgres + helpers pour requêtes simples et transactions
import pg from 'pg'
import dotenv from 'dotenv'

// .env est à la racine du projet (un cran au-dessus de server/)
dotenv.config({ path: '../.env' })

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }  // Neon nécessite SSL
})

pool.on('error', (err) => console.error('[pg pool error]', err))

// Helper requête simple
export const query = (text, params) => pool.query(text, params)

// Helper transaction - utilise quand plusieurs writes doivent réussir ou échouer ensemble
export const withTransaction = async (fn) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
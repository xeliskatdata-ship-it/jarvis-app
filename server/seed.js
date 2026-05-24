// Script de seed : crée Kat et Brice avec password hashé bcrypt
// Lance une seule fois : npm run seed (depuis le dossier server/)
// Idempotent : si l'email existe déjà, on skip.

import bcrypt from 'bcrypt'
import readline from 'readline/promises'
import dotenv from 'dotenv'
import { pool, query } from './db.js'

dotenv.config({ path: '../.env' })

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

async function createUser(name) {
  const email = (await rl.question(`Email pour ${name} : `)).trim().toLowerCase()
  if (!email) { console.log(`Skip ${name} (email vide)`); return }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows.length > 0) {
    console.log(`[seed] ${name} (${email}) existe déjà, skip.`)
    return
  }

  const password = (await rl.question(`Mot de passe pour ${name} (min 8 chars) : `)).trim()
  if (password.length < 8) { console.log('Mot de passe trop court, abort.'); return }

  const hash = await bcrypt.hash(password, 10)
  await query(`
    INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
  `, [email, name, hash])
  console.log(`[seed] ${name} créé.`)
}

console.log('\n=== Seed users Jarvis ===\n')

try {
  await createUser('Kat')
  await createUser('Brice')
  console.log('\nDone. Tu peux maintenant te connecter via /auth/login.')
} catch (err) {
  console.error('Erreur:', err.message)
} finally {
  rl.close()
  await pool.end()
}
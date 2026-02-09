const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { rootDir, ensureDir } = require('./config')

const getNodeSqlite = () => {
  try {
    return require('node:sqlite')
  } catch {
    return null
  }
}

const buildMysqlPool = (config) => {
  const mysql = require('mysql2/promise')
  return mysql.createPool({
    host: config.db.mysql?.host,
    port: config.db.mysql?.port || 3306,
    user: config.db.mysql?.user,
    password: config.db.mysql?.password,
    database: config.db.mysql?.database,
    waitForConnections: true,
    connectionLimit: 10
  })
}

const buildPostgresqlPool = (config) => {
  const { Pool } = require('pg')
  return new Pool({
    host: config.db.postgresql?.host,
    port: config.db.postgresql?.port || 5432,
    user: config.db.postgresql?.user,
    password: config.db.postgresql?.password,
    database: config.db.postgresql?.database
  })
}

const checkDatabase = async (config) => {

  const type = String(config.db?.type || 'sqlite')
  if (type === 'memory') return
  if (type === 'mysql') {
    const pool = buildMysqlPool(config)
    await pool.query('SELECT 1')
    await pool.end()
    return
  }
  if (type === 'postgresql') {
    const pool = buildPostgresqlPool(config)
    await pool.query('SELECT 1')
    await pool.end()
    return
  }
  if (type === 'supabase') {
    const { createClient } = require('@supabase/supabase-js')
    const url = config.db.supabase?.url
    const key = config.db.supabase?.key
    const sb = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await sb.from('public_paths').select('path').limit(1)
    if (error) throw error
    return
  }
  const dbFile = path.resolve(rootDir, config.db.sqlite?.file || 'data/sqlite.db')
  await ensureDir(path.dirname(dbFile))
  if (!fs.existsSync(dbFile)) await fsp.writeFile(dbFile, '')
  const sqlite = getNodeSqlite()
  if (sqlite && sqlite.DatabaseSync) {
    const db = new sqlite.DatabaseSync(dbFile)
    db.exec('SELECT 1')
    db.close()
    return
  }
  let sqlite3 = null
  try {
    sqlite3 = require('sqlite3')
  } catch (err) {
    console.error('[store] sqlite backend requires sqlite3 build scripts to be allowed (pnpm approve-builds)', err)
    throw new Error('sqlite 后端不可用：sqlite3 未安装或未完成构建')
  }
  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, (err) => {
      if (err) return reject(err)
      db.close((err2) => (err2 ? reject(err2) : resolve()))
    })
  })
}


const buildStore = async (config) => {

  const type = String(config.db?.type || 'sqlite')
  if (type === 'memory') {
    const set = new Set()
    return {
      getPublicPaths: async () => Array.from(set),
      setPublicPath: async (p, enabled) => {
        if (enabled) set.add(p)
        else set.delete(p)
      },
      close: async () => {}
    }
  }
  if (type === 'mysql') {
    const pool = buildMysqlPool(config)
    await pool.query('CREATE TABLE IF NOT EXISTS public_paths (path VARCHAR(768) PRIMARY KEY)')
    return {
      getPublicPaths: async () => {
        const [rows] = await pool.query('SELECT path FROM public_paths')
        return rows.map((r) => r.path)
      },
      setPublicPath: async (p, enabled) => {
        if (String(p).length > 768) {
          const err = new Error('路径过长')
          err.status = 400
          err.code = 40001
          err.message = '路径过长'
          throw err
        }
        if (enabled) await pool.query('INSERT INTO public_paths (path) VALUES (?) ON DUPLICATE KEY UPDATE path=VALUES(path)', [p])
        else await pool.query('DELETE FROM public_paths WHERE path=?', [p])
      },
      close: async () => {
        await pool.end()
      }
    }
  }
  if (type === 'postgresql') {
    const pool = buildPostgresqlPool(config)
    await pool.query('CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)')
    return {
      getPublicPaths: async () => {
        const result = await pool.query('SELECT path FROM public_paths')
        return result.rows.map((r) => r.path)
      },
      setPublicPath: async (p, enabled) => {
        if (enabled) await pool.query('INSERT INTO public_paths (path) VALUES ($1) ON CONFLICT (path) DO NOTHING', [p])
        else await pool.query('DELETE FROM public_paths WHERE path=$1', [p])
      },
      close: async () => {
        await pool.end()
      }
    }
  }
  if (type === 'supabase') {
    const { createClient } = require('@supabase/supabase-js')
    const url = config.db.supabase?.url
    const key = config.db.supabase?.key
    const sb = createClient(url, key, { auth: { persistSession: false } })
    return {
      getPublicPaths: async () => {
        const { data, error } = await sb.from('public_paths').select('path')
        if (error) throw error
        return (data || []).map((r) => r.path)
      },
      setPublicPath: async (p, enabled) => {
        if (enabled) {
          const { error } = await sb.from('public_paths').upsert({ path: p })
          if (error) throw error
        } else {
          const { error } = await sb.from('public_paths').delete().eq('path', p)
          if (error) throw error
        }
      },
      close: async () => {}
    }
  }
  const dbFile = path.resolve(rootDir, config.db.sqlite?.file || 'data/sqlite.db')
  await ensureDir(path.dirname(dbFile))
  const sqlite = getNodeSqlite()
  if (sqlite && sqlite.DatabaseSync) {
    const db = new sqlite.DatabaseSync(dbFile)
    db.exec('CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)')
    const selectStmt = db.prepare('SELECT path FROM public_paths')
    const insertStmt = db.prepare('INSERT OR REPLACE INTO public_paths (path) VALUES (?)')
    const deleteStmt = db.prepare('DELETE FROM public_paths WHERE path=?')
    return {
      getPublicPaths: async () => selectStmt.all().map((r) => r.path),
      setPublicPath: async (p, enabled) => {
        if (enabled) insertStmt.run(p)
        else deleteStmt.run(p)
      },
      close: async () => {
        db.close()
      }
    }
  }
  let sqlite3 = null
  try {
    sqlite3 = require('sqlite3')
  } catch (err) {
    console.error('[store] sqlite backend requires sqlite3 build scripts to be allowed (pnpm approve-builds)', err)
    throw new Error('sqlite 后端不可用：sqlite3 未安装或未完成构建')
  }
  const db = new sqlite3.Database(dbFile)
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())))
  const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))))
  await run('CREATE TABLE IF NOT EXISTS public_paths (path TEXT PRIMARY KEY)')
  return {
    getPublicPaths: async () => {
      const rows = await all('SELECT path FROM public_paths')
      return rows.map((r) => r.path)
    },
    setPublicPath: async (p, enabled) => {
      if (enabled) await run('INSERT OR REPLACE INTO public_paths (path) VALUES (?)', [p])
      else await run('DELETE FROM public_paths WHERE path=?', [p])
    },
    close: async () => {
      await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())))
    }
  }
}


module.exports = { buildStore, checkDatabase }


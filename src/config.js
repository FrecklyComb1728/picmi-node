const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const defaultConfigPath = path.join(dataDir, 'config.json')
const rootConfigPath = path.join(rootDir, 'config.json')

const defaultConfig = {
  port: 5409,
  storageRoot: 'uploads',
  auth: { password: 'picmi-node' },
  ipWhitelist: [],
  ipHeader: '',
  db: {
    type: 'sqlite',
    sqlite: { file: 'data/sqlite.db' },
    mysql: { host: '', port: 3306, user: '', password: '', database: '' },
    postgresql: { host: '', port: 5432, user: '', password: '', database: '' },
    supabase: { url: '', key: '' }
  },
  storage: { type: 'local' }
}

const mergeDeep = (target, source) => {
  if (!source || typeof source !== 'object') return target
  const out = { ...target }
  for (const key of Object.keys(source)) {
    const val = source[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = mergeDeep(out[key] || {}, val)
    } else {
      out[key] = val
    }
  }
  return out
}

const ensureDir = async (dir) => {
  await fsp.mkdir(dir, { recursive: true })
}

const loadConfig = async () => {
  await ensureDir(dataDir)
  let configPath = defaultConfigPath
  if (fs.existsSync(rootConfigPath)) configPath = rootConfigPath
  if (!fs.existsSync(configPath)) {
    await fsp.writeFile(defaultConfigPath, JSON.stringify(defaultConfig, null, 2))
    configPath = defaultConfigPath
  }
  const raw = await fsp.readFile(configPath, 'utf8')
  let parsed = {}
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }
  return mergeDeep(defaultConfig, parsed)
}

module.exports = { rootDir, loadConfig, ensureDir }

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
  auth: { enabled: true, password: '' },
  ipWhitelist: [],
  ipHeader: '',
  trustProxy: false,
  limits: {
    jsonBody: '10mb',
    uploadBase64Bytes: 20 * 1024 * 1024,
    uploadFileBytes: 100 * 1024 * 1024,
    uploadFields: 50
  },
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

const readEnv = (name) => {
  const val = process.env[name]
  if (val == null) return ''
  const out = String(val).trim()
  return out
}

const applyEnvOverrides = (config) => {
  const password = readEnv('PICMI_NODE_PASSWORD')
  if (password) config.auth = { ...(config.auth || {}), password }
  const authEnabled = readEnv('PICMI_NODE_AUTH_ENABLED')
  if (authEnabled) config.auth = { ...(config.auth || {}), enabled: authEnabled !== '0' && authEnabled.toLowerCase() !== 'false' }
  const trustProxy = readEnv('PICMI_NODE_TRUST_PROXY')
  if (trustProxy) config.trustProxy = trustProxy !== '0' && trustProxy.toLowerCase() !== 'false'
  const jsonBody = readEnv('PICMI_NODE_JSON_BODY_LIMIT')
  if (jsonBody) config.limits = { ...(config.limits || {}), jsonBody }
  const uploadBase64Bytes = readEnv('PICMI_NODE_UPLOAD_BASE64_BYTES')
  if (uploadBase64Bytes) config.limits = { ...(config.limits || {}), uploadBase64Bytes: Number(uploadBase64Bytes) || (config.limits || {}).uploadBase64Bytes }
  const uploadFileBytes = readEnv('PICMI_NODE_UPLOAD_FILE_BYTES')
  if (uploadFileBytes) config.limits = { ...(config.limits || {}), uploadFileBytes: Number(uploadFileBytes) || (config.limits || {}).uploadFileBytes }
  return config
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
  } catch (err) {
    console.error(`[config] invalid json: ${configPath}`, err)
    parsed = {}
  }
  return applyEnvOverrides(mergeDeep(defaultConfig, parsed))
}

module.exports = { rootDir, loadConfig, ensureDir }

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { loadConfig, rootDir, ensureDir } = require('./src/config')
const { checkDatabase } = require('./src/store')
const { createLogger } = require('./src/logger')

const checkStorageAccess = async (dir) => {
  await fsp.access(dir, fs.constants.R_OK | fs.constants.W_OK)
  const testFile = path.join(dir, `.picmi-node-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await fsp.writeFile(testFile, '1')
  await fsp.readFile(testFile)
  await fsp.unlink(testFile)
}

let didWarnDefaultPassword = false
let didWarnAuthDisabledInDev = false

const isDevelopmentStart = () => {
  const env = String(process.env.NODE_ENV || '').trim().toLowerCase()
  if (env === 'development') return true
  const lifecycleEvent = String(process.env.npm_lifecycle_event || '').trim().toLowerCase()
  if (lifecycleEvent === 'dev') return true
  const execArgv = Array.isArray(process.execArgv) ? process.execArgv : []
  if (execArgv.some((v) => String(v).startsWith('--watch'))) return true
  return false
}

const isTruthy = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return false
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

const hasDebugArgInNpmConfigArgv = () => {
  const raw = String(process.env.npm_config_argv || '').trim()
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw)
    const list = []
    if (Array.isArray(parsed?.original)) list.push(...parsed.original)
    if (Array.isArray(parsed?.cooked)) list.push(...parsed.cooked)
    return list.some((arg) => {
      const v = String(arg || '').trim()
      return v === '--debug' || v === '-d'
    })
  } catch {
    return false
  }
}

const isDebugMode = () => {
  if (process.argv.some((arg) => {
    const v = String(arg).trim()
    return v === '--debug' || v === '-d'
  })) return true
  if (isTruthy(process.env.PICMI_DEBUG)) return true
  if (isTruthy(process.env.npm_config_debug)) return true
  if (String(process.env.npm_config_loglevel || '').trim().toLowerCase() === 'debug') return true
  if (hasDebugArgInNpmConfigArgv()) return true
  return false
}

const normalizeAuth = (config, logger) => {
  const enabled = config.auth?.enabled !== false
  const password = String(config.auth?.password || '').trim()
  if (!enabled) return
  if (!password) {
    if (isDevelopmentStart()) {
      if (!didWarnAuthDisabledInDev) {
        didWarnAuthDisabledInDev = true
        logger.warn('未配置认证密码(auth.password)，开发模式已自动关闭认证(auth.enabled=false)')
      }
      config.auth = { ...(config.auth || {}), enabled: false }
      return
    }
    logger.error('未配置认证密码(auth.password)，请设置密码或显式关闭认证(auth.enabled=false)')
    process.exit(1)
  }
  if (password !== 'picmi-node') return
  if (isDevelopmentStart()) {
    if (!didWarnDefaultPassword) {
      didWarnDefaultPassword = true
      logger.warn('当前密码为项目默认密码，请确保这不是生产环境')
    }
    return
  }
  logger.error('请前往配置文件中更改节点密码(auth.password)')
  process.exit(1)
}

const init = async () => {
  const config = await loadConfig()
  if (isDebugMode()) config.logLevel = 'debug'
  const logger = await createLogger(config)
  normalizeAuth(config, logger)
  const storageRoot = path.resolve(rootDir, config.storageRoot)
  await ensureDir(storageRoot)
  await checkStorageAccess(storageRoot)
  await checkDatabase(config)
  logger.info({ event: 'boot', debug: config.logLevel === 'debug', storageRoot, logFile: logger.file, logLevel: logger.level })
  return { config, storageRoot, logger }
}

init()
  .then(({ config, storageRoot, logger }) => {
    const { start } = require('./src/server')
    return start(config, storageRoot, logger)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })


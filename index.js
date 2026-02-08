const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { loadConfig, rootDir, ensureDir } = require('./src/config')
const { checkDatabase } = require('./src/store')

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

const normalizeAuth = (config) => {
  const enabled = config.auth?.enabled !== false
  const password = String(config.auth?.password || '').trim()
  if (!enabled) return
  if (!password) {
    if (isDevelopmentStart()) {
      if (!didWarnAuthDisabledInDev) {
        didWarnAuthDisabledInDev = true
        console.warn('\x1b[31m%s\x1b[0m', '>\n> 未配置认证密码(auth.password)，开发模式已自动关闭认证(auth.enabled=false)\n>')
      }
      config.auth = { ...(config.auth || {}), enabled: false }
      return
    }
    console.error('\x1b[31m%s\x1b[0m', '>\n> 未配置认证密码(auth.password)，请设置密码或显式关闭认证(auth.enabled=false)\n>')
    process.exit(1)
  }
  if (password !== 'picmi-node') return
  if (isDevelopmentStart()) {
    if (!didWarnDefaultPassword) {
      didWarnDefaultPassword = true
      console.warn('\x1b[31m%s\x1b[0m', '>\n> 当前密码为项目默认密码，请确保这不是生产环境！\n>')
    }
    return
  }
  console.error('\x1b[31m%s\x1b[0m', '>\n> 请前往配置文件中更改节点密码(auth.password)\n>')
  process.exit(1)
}

const init = async () => {
  const config = await loadConfig()
  normalizeAuth(config)
  const storageRoot = path.resolve(rootDir, config.storageRoot)
  await ensureDir(storageRoot)
  await checkStorageAccess(storageRoot)
  await checkDatabase(config)
  return { config, storageRoot }
}

init()
  .then(({ config, storageRoot }) => {
    const { start } = require('./src/server')
    return start(config, storageRoot)
  })
  .catch((err) => {
    console.error('\x1b[31m%s\x1b[0m', err)
    process.exit(1)
  })


const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const levelRank = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

const normalizeLevel = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return 'info'
}

const ensureLogFile = async (filePath) => {
  const abs = path.resolve(filePath)
  await fsp.mkdir(path.dirname(abs), { recursive: true })
  return abs
}

const createLogger = async (config) => {
  const level = normalizeLevel(config?.logLevel || process.env.LOG_LEVEL || 'info')
  const logFilePath = await ensureLogFile(config?.logFile || './logs/app.log')

  const write = (levelName, args) => {
    if (levelRank[levelName] < levelRank[level]) return
    const ts = new Date().toISOString()
    const parts = args.map((item) => {
      if (item instanceof Error) {
        return JSON.stringify({ name: item.name, message: item.message, stack: item.stack })
      }
      if (typeof item === 'string') return item
      try {
        return JSON.stringify(item)
      } catch {
        return String(item)
      }
    })
    const line = `[${ts}] [${levelName}] ${parts.join(' ')}`
    if (levelName === 'error') console.error(line)
    else if (levelName === 'warn') console.warn(line)
    else console.log(line)
    fs.appendFile(logFilePath, `${line}\n`, () => {})
  }

  return {
    level,
    file: logFilePath,
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args)
  }
}

module.exports = { createLogger, normalizeLevel }

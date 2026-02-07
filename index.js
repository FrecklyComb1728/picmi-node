const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { start } = require('./src/server')
const { loadConfig, rootDir, ensureDir } = require('./src/config')
const { checkDatabase } = require('./src/store')

const checkStorageAccess = async (dir) => {
  await fsp.access(dir, fs.constants.R_OK | fs.constants.W_OK)
  const testFile = path.join(dir, `.picmi-node-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await fsp.writeFile(testFile, '1')
  await fsp.readFile(testFile)
  await fsp.unlink(testFile)
}

const init = async () => {
  const config = await loadConfig()
  const storageRoot = path.resolve(rootDir, config.storageRoot)
  await ensureDir(storageRoot)
  await checkStorageAccess(storageRoot)
  await checkDatabase(config)
  return { config, storageRoot }
}

init()
  .then(({ config, storageRoot }) => start(config, storageRoot))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })


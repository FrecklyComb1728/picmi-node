const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const express = require('express')
const Busboy = require('busboy')
const { listEntries, ensureDirFor, copyRecursive, removeRecursive } = require('./images')
const { normalizePath, resolvePathSafe } = require('./paths')
const { getClientIp, checkWhitelist, requireAuth } = require('./security')
const { buildStore } = require('./store')
const { buildCpuSampler, buildTrafficTracker, createStatusPayload } = require('./status')

const ok = (res, data, message = 'ok') => res.json({ code: 0, message, data })
const fail = (res, status, code, message) => res.status(status).json({ code, message, data: null })

const wrapAsync = (handler) => async (req, res) => {
  try {
    await handler(req, res)
  } catch (err) {
    if (err && err.status && err.code && err.message) return fail(res, err.status, err.code, err.message)
    console.error(`[${new Date().toISOString()}] unhandled error ${req.method} ${req.originalUrl}`, err)
    fail(res, 500, 1, '服务异常')
  }
}

const sanitizeName = (value) => {
  const name = String(value || '').trim()
  if (!name) return ''
  if (name.includes('/') || name.includes('\\')) return ''
  if (name === '.' || name === '..') return ''
  return name
}

const normalizeLimits = (config) => {
  const limits = config.limits || {}
  return {
    jsonBody: String(limits.jsonBody || '10mb'),
    uploadBase64Bytes: Number(limits.uploadBase64Bytes || 0) || 20 * 1024 * 1024,
    uploadFileBytes: Number(limits.uploadFileBytes || 0) || 100 * 1024 * 1024,
    uploadFields: Number(limits.uploadFields || 0) || 50
  }
}

const decodeBase64 = (input, maxBytes) => {
  const raw = String(input || '').trim()
  if (!raw) return null
  const parts = raw.split(',')
  let data = (parts.length > 1 ? parts.slice(1).join(',') : raw).trim().replace(/\s+/g, '')
  if (!data) return null
  data = data.replace(/-/g, '+').replace(/_/g, '/')
  if (data.length % 4 !== 0) data = data.padEnd(data.length + (4 - (data.length % 4)), '=')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return null
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  const estimatedBytes = Math.max(0, Math.floor(data.length * 3 / 4) - padding)
  if (estimatedBytes > maxBytes) {
    const err = new Error('payload too large')
    err.status = 413
    err.code = 41301
    err.message = '文件过大'
    throw err
  }
  return Buffer.from(data, 'base64')
}

const start = async (config, storageRoot) => {

  const store = await buildStore(config)
  const app = express()
  const limits = normalizeLimits(config)
  const cpuUsage = buildCpuSampler()
  const traffic = buildTrafficTracker()
  const statusPayload = createStatusPayload(config, storageRoot, traffic, cpuUsage)

  app.set('trust proxy', config.trustProxy === true)
  app.set('x-powered-by', false)
  app.use((req, res, next) => {
    if (!checkWhitelist(req, config)) return res.sendStatus(403)
    next()
  })
  app.use(traffic.middleware)
  app.use(express.json({ limit: limits.jsonBody }))
  app.use('/uploads', express.static(storageRoot, {
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    }
  }))



  app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }))


  app.get('/api/status', (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    ok(res, statusPayload())
  })

  app.get('/api/status/stream', (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    const ip = getClientIp(req, config)
    console.log(`[${new Date().toISOString()}] status stream connected ${ip}`)
    const send = () => {
      res.write(`data: ${JSON.stringify(statusPayload())}\n\n`)
    }
    send()
    const timer = setInterval(send, 1000)
    req.on('close', () => {
      clearInterval(timer)
      console.log(`[${new Date().toISOString()}] status stream closed ${ip}`)
    })
  })

  const checkPublic = async (p) => {
    const list = await store.getPublicPaths()
    return list.includes(p)
  }

  app.get('/api/images/list', wrapAsync(async (req, res) => {
    const currentPath = normalizePath(req.query.path || '/')
    const allowPublic = await checkPublic(currentPath)
    if (!requireAuth(req, res, config, allowPublic)) return
    const data = await listEntries(storageRoot, currentPath)
    ok(res, data)
  }))

  app.get('/api/images/exists', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const currentPath = normalizePath(req.query.path || '/')
    const filename = String(req.query.filename || '')
    if (!filename) return fail(res, 400, 40001, '参数错误')
    const { target } = resolvePathSafe(storageRoot, path.posix.join(currentPath, filename))
    const exists = fs.existsSync(target)
    ok(res, { exists })
  }))

  app.post('/api/images/mkdir', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const name = sanitizeName(req.body?.name)
    if (!name) return fail(res, 400, 40001, '参数错误')
    const currentPath = normalizePath(req.body?.path || '/')
    const { target } = resolvePathSafe(storageRoot, path.posix.join(currentPath, name))

    if (fs.existsSync(target)) return fail(res, 409, 40901, '文件夹已存在')
    await ensureDirFor(target)
    ok(res, null)
  }))

  app.post('/api/images/delete', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const paths = req.body?.paths
    if (!Array.isArray(paths)) return fail(res, 400, 40001, '参数错误')
    for (const p of paths) {
      const { target } = resolvePathSafe(storageRoot, p)
      await removeRecursive(target)
    }
    ok(res, null)
  }))

  app.post('/api/images/copy', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const items = req.body?.items
    if (!Array.isArray(items)) return fail(res, 400, 40001, '参数错误')
    const dest = normalizePath(req.body?.toPath || '/')
    for (const item of items) {
      const from = resolvePathSafe(storageRoot, item.path).target
      const target = resolvePathSafe(storageRoot, path.posix.join(dest, path.basename(from))).target
      await copyRecursive(from, target)
    }
    ok(res, null)
  }))

  app.post('/api/images/move', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const items = req.body?.items
    if (!Array.isArray(items)) return fail(res, 400, 40001, '参数错误')
    const dest = normalizePath(req.body?.toPath || '/')
    for (const item of items) {
      const from = resolvePathSafe(storageRoot, item.path).target
      const target = resolvePathSafe(storageRoot, path.posix.join(dest, path.basename(from))).target
      await ensureDirFor(path.dirname(target))
      await fsp.rename(from, target)
    }
    ok(res, null)
  }))

  app.post('/api/images/rename', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const current = req.body?.path
    const newName = sanitizeName(req.body?.newName)
    if (!current || !newName) return fail(res, 400, 40001, '参数错误')
    const { target } = resolvePathSafe(storageRoot, current)
    const basePath = path.posix.dirname(normalizePath(current))
    const { target: nextTarget } = resolvePathSafe(storageRoot, path.posix.join(basePath, newName))
    await fsp.rename(target, nextTarget)
    ok(res, null)
  }))

  app.post('/api/images/public', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const current = normalizePath(req.body?.path || '/')
    const list = await store.getPublicPaths()
    const enabled = !list.includes(current)
    await store.setPublicPath(current, enabled)
    ok(res, { enabled })
  }))

  app.get('/api/images/public-status', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const current = normalizePath(req.query.path || '/')
    const list = await store.getPublicPaths()
    ok(res, { enabled: list.includes(current) })
  }))

  app.post('/api/images/upload-base64', wrapAsync(async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const currentPath = normalizePath(req.body?.path || '/')
    const filename = sanitizeName(req.body?.filename)
    const base64 = req.body?.base64
    const override = String(req.body?.override || '0') === '1'
    if (!filename || !base64) return fail(res, 400, 40001, '参数错误')
    const { target } = resolvePathSafe(storageRoot, path.posix.join(currentPath, filename))

    if (!override && fs.existsSync(target)) return fail(res, 409, 40901, '文件已存在')
    const buf = decodeBase64(base64, limits.uploadBase64Bytes)
    if (!buf) return fail(res, 400, 40001, '参数错误')
    await ensureDirFor(path.dirname(target))
    await fsp.writeFile(target, buf)
    console.log(`[${new Date().toISOString()}] upload base64 ${normalizePath(path.posix.join(currentPath, String(filename)))}`)
    ok(res, null)
  }))

  app.post('/api/images/upload', (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fields: limits.uploadFields,
        fileSize: limits.uploadFileBytes
      }
    })
    const fields = {}
    let fileName = ''
    let tmpPath = ''
    let writeStream = null
    let fileWrite = null
    let responded = false

    const cleanup = async () => {
      if (!tmpPath) return
      const target = tmpPath
      tmpPath = ''
      await fsp.unlink(target).catch((err) => {
        if (err && err.code === 'ENOENT') return
        console.warn(`[${new Date().toISOString()}] cleanup failed`, err)
      })
    }

    const respondFail = async (status, code, message) => {
      if (responded) return
      responded = true
      if (writeStream) writeStream.destroy()
      await cleanup()
      fail(res, status, code, message)
    }

    busboy.on('filesLimit', () => respondFail(413, 41301, '文件过大'))
    busboy.on('fieldsLimit', () => respondFail(400, 40001, '参数过多'))
    busboy.on('partsLimit', () => respondFail(400, 40001, '参数过多'))
    busboy.on('error', () => respondFail(400, 40001, '参数错误'))

    busboy.on('file', (name, file, info) => {
      if (name !== 'file') return file.resume()
      if (writeStream) {
        file.resume()
        respondFail(400, 40001, '参数错误')
        return
      }
      fileName = info.filename || ''
      const safeName = sanitizeName(fileName)
      if (!safeName) {
        file.resume()
        respondFail(400, 40001, '参数错误')
        return
      }
      const tmpDir = path.join(storageRoot, '.tmp')
      ensureDirFor(tmpDir)
        .then(() => {
          tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(16).slice(2)}`)
          writeStream = fs.createWriteStream(tmpPath)
          fileWrite = new Promise((resolve, reject) => {
            file.on('error', reject)
            file.on('limit', () => reject(Object.assign(new Error('file too large'), { status: 413, code: 41301, message: '文件过大' })))
            writeStream.on('error', reject)
            writeStream.on('close', resolve)
          })
          file.pipe(writeStream)
        })
        .catch((err) => {
          console.error(`[${new Date().toISOString()}] upload init failed`, err)
          respondFail(500, 1, '服务异常')
        })
    })

    busboy.on('field', (name, val) => {
      fields[name] = val
    })

    busboy.on('finish', async () => {
      if (responded) return
      try {
        if (fileWrite) await fileWrite
        const currentPath = normalizePath(fields.path || '/')
        const override = String(fields.override || '0') === '1'
        const safeName = sanitizeName(fileName)
        if (!safeName || !tmpPath) return respondFail(400, 40001, '文件为空')
        const { target } = resolvePathSafe(storageRoot, path.posix.join(currentPath, safeName))
        if (!override && fs.existsSync(target)) return respondFail(409, 40901, '文件已存在')
        await ensureDirFor(path.dirname(target))
        await fsp.rename(tmpPath, target)
        tmpPath = ''
        responded = true
        console.log(`[${new Date().toISOString()}] upload ${normalizePath(path.posix.join(currentPath, safeName))}`)
        ok(res, null)
      } catch (err) {
        const status = err && err.status ? err.status : 500
        const code = err && err.code ? err.code : 1
        const message = err && err.message ? err.message : '服务异常'
        if (status === 500) console.error(`[${new Date().toISOString()}] upload failed`, err)
        respondFail(status, code, message)
      }
    })

    req.pipe(busboy)
  })


  const server = app.listen(config.port, () => {
    console.log(`[${new Date().toISOString()}] picmi-node started on ${config.port}`)
  })

  const originalClose = server.close.bind(server)

  let shuttingDown = false
  const closeHttpServer = async () => {
    await new Promise((resolve) => originalClose(resolve))
  }
  const shutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[${new Date().toISOString()}] shutting down (${signal})`)
    if (traffic && typeof traffic.close === 'function') traffic.close()
    await closeHttpServer()
    if (store && typeof store.close === 'function') await store.close()
  }

  process.once('SIGINT', () => shutdown('SIGINT').then(() => process.exit(0)).catch(() => process.exit(1)))
  process.once('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)).catch(() => process.exit(1)))

  server.close = (callback) => {
    shutdown('close')
      .then(() => (typeof callback === 'function' ? callback() : null))
      .catch(() => (typeof callback === 'function' ? callback() : null))
    return server
  }

  return server
}

module.exports = { start }

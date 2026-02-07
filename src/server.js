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

const sanitizeName = (value) => {
  const name = String(value || '').trim()
  if (!name) return ''
  if (name.includes('/') || name.includes('\\')) return ''
  if (name === '.' || name === '..') return ''
  return name
}

const start = async (config, storageRoot) => {

  const store = await buildStore(config)
  const app = express()
  const cpuUsage = buildCpuSampler()
  const traffic = buildTrafficTracker()
  const statusPayload = createStatusPayload(config, storageRoot, traffic, cpuUsage)

  app.set('x-powered-by', false)
  app.use((req, res, next) => {
    if (!checkWhitelist(req, config)) return res.sendStatus(403)
    next()
  })
  app.use(traffic.middleware)
  app.use(express.json({ limit: '1gb' }))
  app.use('/uploads', express.static(storageRoot))



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

  app.get('/api/images/list', async (req, res) => {
    try {
      const currentPath = normalizePath(req.query.path || '/')
      const allowPublic = await checkPublic(currentPath)
      if (!requireAuth(req, res, config, allowPublic)) return
      const data = await listEntries(storageRoot, currentPath)
      ok(res, data)
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.get('/api/images/exists', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const currentPath = normalizePath(req.query.path || '/')
      const filename = String(req.query.filename || '')
      if (!filename) return fail(res, 400, 40001, '参数错误')
      const { target } = resolvePathSafe(storageRoot, path.posix.join(currentPath, filename))
      const exists = fs.existsSync(target)
      ok(res, { exists })
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/mkdir', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const name = sanitizeName(req.body?.name)
      if (!name) return fail(res, 400, 40001, '参数错误')
      const currentPath = normalizePath(req.body?.path || '/')
      const { target } = resolvePathSafe(storageRoot, path.posix.join(currentPath, name))

      if (fs.existsSync(target)) return fail(res, 409, 40901, '文件夹已存在')
      await ensureDirFor(target)
      ok(res, null)
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/delete', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const paths = req.body?.paths
      if (!Array.isArray(paths)) return fail(res, 400, 40001, '参数错误')
      for (const p of paths) {
        const { target } = resolvePathSafe(storageRoot, p)
        await removeRecursive(target)
      }
      ok(res, null)
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/copy', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const items = req.body?.items
      if (!Array.isArray(items)) return fail(res, 400, 40001, '参数错误')
      const dest = normalizePath(req.body?.toPath || '/')
      for (const item of items) {
        const from = resolvePathSafe(storageRoot, item.path).target
        const target = resolvePathSafe(storageRoot, path.posix.join(dest, path.basename(from))).target
        await copyRecursive(from, target)
      }
      ok(res, null)
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/move', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
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
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/rename', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const current = req.body?.path
      const newName = sanitizeName(req.body?.newName)
      if (!current || !newName) return fail(res, 400, 40001, '参数错误')
      const { target } = resolvePathSafe(storageRoot, current)
      const basePath = path.posix.dirname(normalizePath(current))
      const { target: nextTarget } = resolvePathSafe(storageRoot, path.posix.join(basePath, newName))
      await fsp.rename(target, nextTarget)
      ok(res, null)

    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/public', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const current = normalizePath(req.body?.path || '/')
      const list = await store.getPublicPaths()
      const enabled = !list.includes(current)
      await store.setPublicPath(current, enabled)
      ok(res, { enabled })
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.get('/api/images/public-status', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const current = normalizePath(req.query.path || '/')
      const list = await store.getPublicPaths()
      ok(res, { enabled: list.includes(current) })
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/upload-base64', async (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    try {
      const currentPath = normalizePath(req.body?.path || '/')
      const filename = sanitizeName(req.body?.filename)
      const base64 = req.body?.base64
      const override = String(req.body?.override || '0') === '1'
      if (!filename || !base64) return fail(res, 400, 40001, '参数错误')
      const { target } = resolvePathSafe(storageRoot, path.posix.join(currentPath, filename))

      if (!override && fs.existsSync(target)) return fail(res, 409, 40901, '文件已存在')
      const raw = String(base64)
      const parts = raw.split(',')
      const data = parts.length > 1 ? parts.slice(1).join(',') : raw
      await ensureDirFor(path.dirname(target))
      await fsp.writeFile(target, Buffer.from(data, 'base64'))
      console.log(`[${new Date().toISOString()}] upload base64 ${normalizePath(path.posix.join(currentPath, String(filename)))}`)
      ok(res, null)
    } catch {
      fail(res, 500, 1, '服务异常')
    }
  })

  app.post('/api/images/upload', (req, res) => {
    if (!requireAuth(req, res, config, false)) return
    const busboy = Busboy({ headers: req.headers })
    const fields = {}
    let fileName = ''
    let tmpPath = ''
    let writeStream = null
    let responded = false

    const cleanup = async () => {
      if (!tmpPath) return
      const target = tmpPath
      tmpPath = ''
      await fsp.unlink(target).catch(() => {})
    }

    const respondFail = async (status, code, message) => {
      if (responded) return
      responded = true
      if (writeStream) writeStream.destroy()
      await cleanup()
      fail(res, status, code, message)
    }

    busboy.on('file', (name, file, info) => {
      if (name !== 'file') return file.resume()
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
          file.on('error', () => respondFail(500, 1, '服务异常'))
          writeStream.on('error', () => respondFail(500, 1, '服务异常'))
          file.pipe(writeStream)
        })
        .catch(() => {
          respondFail(500, 1, '服务异常')
        })
    })

    busboy.on('field', (name, val) => {
      fields[name] = val
    })

    busboy.on('finish', async () => {
      if (responded) return
      try {
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
      } catch {
        respondFail(500, 1, '服务异常')
      }
    })

    req.pipe(busboy)
  })


  app.listen(config.port, () => {
    console.log(`[${new Date().toISOString()}] picmi-node started on ${config.port}`)
  })
}

module.exports = { start }

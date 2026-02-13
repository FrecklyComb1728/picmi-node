const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { normalizePath, resolvePathSafe, toUrlPath } = require('./paths')

const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])

const listEntries = async (root, currentPath) => {
  const { target, normalized } = resolvePathSafe(root, currentPath)
  if (!fs.existsSync(target)) return { path: normalized, items: [] }
  const stat = await fsp.stat(target)
  if (!stat.isDirectory()) return { path: normalized, items: [] }
  const entries = await fsp.readdir(target, { withFileTypes: true })
  const items = []
  for (const entry of entries) {
    const entryPath = path.join(target, entry.name)
    const relative = normalized.replace(/^\/+/, '')
    const entryUrlPath = toUrlPath(path.posix.join('/uploads', relative, entry.name))
    if (entry.isDirectory()) {
      items.push({ type: 'folder', name: entry.name, path: normalizePath(path.posix.join(normalized, entry.name)) })
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      const info = await fsp.stat(entryPath)
      const isImage = imageExts.has(ext)
      items.push({ type: isImage ? 'image' : 'file', name: entry.name, path: normalizePath(path.posix.join(normalized, entry.name)), url: entryUrlPath, size: info.size, uploadedAt: info.mtime.toISOString() })
    }

  }
  return { path: normalized, items }
}

const ensureDirFor = async (dir) => {
  await fsp.mkdir(dir, { recursive: true })
}

const copyRecursive = async (from, to) => {
  const stat = await fsp.stat(from)
  if (stat.isDirectory()) {
    await ensureDirFor(to)
    const items = await fsp.readdir(from)
    for (const item of items) await copyRecursive(path.join(from, item), path.join(to, item))
    return
  }
  await ensureDirFor(path.dirname(to))
  await fsp.copyFile(from, to)
}

const removeRecursive = async (target) => {
  if (!fs.existsSync(target)) return
  const stat = await fsp.stat(target)
  if (stat.isDirectory()) {
    const items = await fsp.readdir(target)
    for (const item of items) await removeRecursive(path.join(target, item))
    await fsp.rmdir(target)
    return
  }
  await fsp.unlink(target)
}

module.exports = { listEntries, ensureDirFor, copyRecursive, removeRecursive }

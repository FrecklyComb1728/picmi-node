const path = require('node:path')

const normalizePath = (input) => {
  let p = String(input || '/')
  if (!p.startsWith('/')) p = `/${p}`
  p = path.posix.normalize(p)
  if (p === '.') p = '/'
  if (!p.startsWith('/')) p = `/${p}`
  return p
}

const resolvePathSafe = (root, input) => {
  const normalized = normalizePath(input)
  const target = path.resolve(root, `.${normalized}`)
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || rel.includes(`..${path.sep}`)) throw new Error('invalid path')
  return { target, normalized }
}

const toUrlPath = (p) => `/${String(p).replace(/\\/g, '/').replace(/^\/+/, '')}`

module.exports = { normalizePath, resolvePathSafe, toUrlPath }

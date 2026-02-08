const net = require('node:net')
const crypto = require('node:crypto')

const safeEqual = (a, b) => {
  const aBuf = Buffer.from(String(a || ''))
  const bBuf = Buffer.from(String(b || ''))
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

const parseIpv4 = (ip) => ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0

const expandIpv6 = (ip) => {
  let source = ip.toLowerCase()
  const zoneIndex = source.indexOf('%')
  if (zoneIndex > -1) source = source.slice(0, zoneIndex)
  if (source.includes('::')) {
    const parts = source.split('::')
    const leftParts = parts[0] ? parts[0].split(':') : []
    const rightParts = parts[1] ? parts[1].split(':') : []
    const fill = new Array(8 - leftParts.length - rightParts.length).fill('0')
    source = [...leftParts, ...fill, ...rightParts].join(':')
  }
  const parts = source.split(':').map((p) => p || '0')
  const expanded = []
  for (const part of parts) {
    if (part.includes('.')) {
      const v4 = part.split('.')
      expanded.push(((Number(v4[0]) << 8) | Number(v4[1])).toString(16))
      expanded.push(((Number(v4[2]) << 8) | Number(v4[3])).toString(16))
    } else {
      expanded.push(part)
    }
  }
  while (expanded.length < 8) expanded.push('0')
  return expanded.slice(0, 8)
}

const parseIpv6 = (ip) => {
  const parts = expandIpv6(ip)
  let out = 0n
  for (const part of parts) out = (out << 16n) + BigInt(parseInt(part, 16) || 0)
  return out
}

const ipInCidr = (ip, cidr) => {
  const [base, maskStr] = cidr.split('/')
  const maskBits = Number(maskStr)
  const version = net.isIP(ip)
  if (!version) return false
  if (version === 4) {
    if (net.isIP(base) !== 4) return false
    const ipNum = parseIpv4(ip)
    const baseNum = parseIpv4(base)
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0
    return (ipNum & mask) === (baseNum & mask)
  }
  if (net.isIP(base) !== 6) return false
  const ipNum = parseIpv6(ip)
  const baseNum = parseIpv6(base)
  const mask = maskBits === 0 ? 0n : (0xffffffffffffffffffffffffffffffffn << BigInt(128 - maskBits)) & 0xffffffffffffffffffffffffffffffffn
  return (ipNum & mask) === (baseNum & mask)
}

const matchIp = (ip, rule) => {
  if (!rule) return false
  if (rule.includes('/')) return ipInCidr(ip, rule)
  return ip === rule
}

const getClientIp = (req, config) => {
  const header = String(config.ipHeader || '').trim().toLowerCase()
  const trustProxy = config.trustProxy === true
  let ip = ''
  if (trustProxy && header) {
    const raw = req.headers[header]
    if (Array.isArray(raw)) ip = raw[0]
    else if (raw) ip = String(raw).split(',')[0].trim()
  }
  if (!ip) ip = req.socket.remoteAddress || ''
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  return ip
}

const checkWhitelist = (req, config) => {
  const list = Array.isArray(config.ipWhitelist) ? config.ipWhitelist : []
  if (!list.length) return true
  const ip = getClientIp(req, config)
  if (!net.isIP(ip)) return false
  return list.some((rule) => matchIp(ip, String(rule).trim()))
}

const readAuthToken = (req) => {
  const header = req.headers['x-node-password'] || req.headers['x-picmi-node-password']
  if (header) return String(Array.isArray(header) ? header[0] : header)
  const auth = req.headers.authorization
  if (auth && String(auth).toLowerCase().startsWith('bearer ')) return String(auth).slice(7)
  return ''

}

const requireAuth = (req, res, config, allow) => {
  const enabled = config.auth?.enabled !== false
  if (!enabled) return true
  const password = String(config.auth?.password || '').trim()
  if (!password) {
    res.status(500).json({ code: 50001, message: '未配置认证密码', data: null })
    return false
  }
  if (allow) return true
  const token = readAuthToken(req)
  if (token && safeEqual(token, password)) return true
  res.status(401).json({ code: 40101, message: '未登录', data: null })
  return false
}

module.exports = { getClientIp, checkWhitelist, requireAuth }

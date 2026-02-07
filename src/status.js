const os = require('node:os')
const fs = require('node:fs')
const fsp = require('node:fs/promises')


const buildCpuSampler = () => {
  let last = os.cpus()
  return () => {
    const next = os.cpus()
    let idle = 0
    let total = 0
    for (let i = 0; i < next.length; i++) {
      const lastTimes = last[i].times
      const nextTimes = next[i].times
      const idleDiff = nextTimes.idle - lastTimes.idle
      const totalDiff = Object.values(nextTimes).reduce((a, b) => a + b, 0) - Object.values(lastTimes).reduce((a, b) => a + b, 0)
      idle += idleDiff
      total += totalDiff
    }
    last = next
    if (!total) return 0
    const usage = 1 - idle / total
    return Math.max(0, Math.min(1, usage))
  }
}

const readLinuxBytes = async () => {

  try {
    const content = await fsp.readFile('/proc/net/dev', 'utf8')
    const lines = content.split(/\r?\n/).slice(2)
    let inBytes = 0
    let outBytes = 0
    for (const line of lines) {
      if (!line.includes(':')) continue
      const parts = line.split(':')
      const fields = parts[1].trim().split(/\s+/)
      const rx = Number(fields[0])
      const tx = Number(fields[8])
      if (Number.isFinite(rx)) inBytes += rx
      if (Number.isFinite(tx)) outBytes += tx
    }
    return { in: inBytes, out: outBytes }
  } catch {
    return null
  }
}

const readSystemBytes = async () => {
  if (process.platform === 'linux') return readLinuxBytes()
  return null
}


const buildSystemTrafficTracker = () => {
  const state = { inSpeed: 0, outSpeed: 0, lastIn: 0, lastOut: 0, lastTime: Date.now(), ready: false, available: false }
  const update = async () => {
    const bytes = await readSystemBytes()
    if (!bytes) {
      state.available = false
      return
    }
    const now = Date.now()

    if (!state.ready) {
      state.ready = true
      state.available = true
      state.lastIn = bytes.in
      state.lastOut = bytes.out
      state.lastTime = now
      state.inSpeed = 0
      state.outSpeed = 0
      return
    }
    const dt = Math.max((now - state.lastTime) / 1000, 1)
    state.inSpeed = (bytes.in - state.lastIn) / dt
    state.outSpeed = (bytes.out - state.lastOut) / dt
    state.lastIn = bytes.in
    state.lastOut = bytes.out
    state.lastTime = now
    state.available = true
  }

  update().catch(() => {})
  setInterval(() => {
    update().catch(() => {})
  }, 1000)
  return { sample: () => ({ in: state.inSpeed, out: state.outSpeed, available: state.available }) }
}

const buildTrafficTracker = () => {
  const state = { inBytes: 0, outBytes: 0, lastIn: 0, lastOut: 0, lastTime: Date.now() }
  const system = buildSystemTrafficTracker()
  const middleware = (req, res, next) => {
    const inLen = Number(req.headers['content-length'] || 0)
    if (!Number.isNaN(inLen)) state.inBytes += inLen
    const write = res.write
    const end = res.end
    let outLen = 0
    res.write = function (chunk, ...args) {
      if (chunk) outLen += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk)
      return write.call(this, chunk, ...args)
    }
    res.end = function (chunk, ...args) {
      if (chunk) outLen += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk)
      state.outBytes += outLen
      return end.call(this, chunk, ...args)
    }
    next()
  }
  const sample = () => {
    const now = Date.now()
    const dt = Math.max((now - state.lastTime) / 1000, 1)
    const inSpeed = (state.inBytes - state.lastIn) / dt
    const outSpeed = (state.outBytes - state.lastOut) / dt
    state.lastTime = now
    state.lastIn = state.inBytes
    state.lastOut = state.outBytes
    return { in: inSpeed, out: outSpeed }
  }
  return { middleware, sample, systemSample: system.sample }
}

const getDiskInfo = (target) => {
  try {
    const stat = fs.statfsSync(target)
    const total = stat.bsize * stat.blocks
    const free = stat.bsize * stat.bfree
    const used = total - free
    const usage = total ? used / total : 0
    return { total, used, free, usage }
  } catch {
    return { total: 0, used: 0, free: 0, usage: 0 }
  }
}

const createStatusPayload = (config, storageRoot, traffic, cpuUsage) => {
  return () => {
    const mode = String(config.storage?.type || 'local')
    if (mode !== 'local') {
      return { mode, time: new Date().toISOString(), storage: { connected: false }, online: false, reachable: false }
    }
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const disk = getDiskInfo(storageRoot)
    const sysBandwidth = traffic.systemSample ? traffic.systemSample() : null
    const appBandwidth = traffic.sample()
    const bandwidth = sysBandwidth && sysBandwidth.available ? { in: sysBandwidth.in, out: sysBandwidth.out } : appBandwidth
    const cpuUsageValue = cpuUsage()
    return {
      mode,
      time: new Date().toISOString(),
      cpu: { usage: cpuUsageValue },
      memory: { total: totalMem, used: usedMem, usage: totalMem ? usedMem / totalMem : 0 },
      disk,
      bandwidth: { ...bandwidth, up: bandwidth.out, down: bandwidth.in },
      cpuPercent: cpuUsageValue * 100,
      memoryUsed: usedMem,
      memoryTotal: totalMem,
      diskUsed: disk.used,
      diskTotal: disk.total,
      bandwidthUp: bandwidth.out,
      bandwidthDown: bandwidth.in,
      up: bandwidth.out,
      down: bandwidth.in,
      online: true,
      reachable: true,
      uptime: process.uptime()
    }
  }
}

module.exports = { buildCpuSampler, buildTrafficTracker, createStatusPayload }

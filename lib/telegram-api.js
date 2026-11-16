import https from 'node:https'
import dns from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'

/**
 * Apel către Telegram Bot API cu node:https, nu cu fetch.
 *
 * Diferențele față de fetch contează când serverul (Vercel) „nu ajunge" la Telegram:
 *  - forțează IPv4 (`family: 4`): api.telegram.org are și adresă IPv6, iar un mediu fără
 *    rută IPv6 poate rămâne agățat pe ea până la expirare;
 *  - are timeout de conectare și timeout total, deci nu rămâne niciodată deschis;
 *  - la eșec întoarce codul real al erorii (ETIMEDOUT, ENETUNREACH, ECONNRESET…), nu doar „timeout".
 *
 * Întoarce mereu un obiect, nu aruncă: { ok: true, result } sau { ok: false, description, code? }.
 */
export function telegramRequest(token, method, payload = {}, { timeoutMs = 8000 } = {}) {
  if (!token) {
    return Promise.resolve({ ok: false, description: 'Tokenul botului lipsește din variabilele de mediu' })
  }

  return new Promise((resolve) => {
    const body = JSON.stringify(payload ?? {})
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolve(value)
    }

    const req = https.request(
      {
        host: 'api.telegram.org',
        path: `/bot${token}/${method}`,
        method: 'POST',
        family: 4,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            finish(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch {
            finish({ ok: false, description: `Răspuns neașteptat de la Telegram (HTTP ${res.statusCode})` })
          }
        })
        res.on('error', (err) => finish(failure(err)))
      }
    )

    const deadline = setTimeout(() => {
      finish({
        ok: false,
        code: 'TIMEOUT',
        description: `Telegram nu a răspuns în ${Math.round(timeoutMs / 1000)} secunde`,
      })
      req.destroy()
    }, timeoutMs)

    req.on('error', (err) => finish(failure(err)))
    req.write(body)
    req.end()
  })
}

// ─── Diagnostic de rețea ────────────────────────────────────────────────
// Când Telegram „nu răspunde", arată la ce pas se oprește: DNS, conexiune TCP,
// TLS sau răspunsul HTTP. Un host de control (GitHub) arată dacă serverul are
// internet în general sau doar Telegram e problema.

const STEP_TIMEOUT_MS = 4000

function step(run) {
  const started = Date.now()
  return new Promise((resolve) => {
    let done = false
    const finish = (ok, extra = {}) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ ok, ms: Date.now() - started, ...extra })
    }
    const timer = setTimeout(() => finish(false, { error: 'TIMEOUT' }), STEP_TIMEOUT_MS)
    run(finish)
  })
}

async function probeHost(host) {
  const result = { host }

  result.dns = await step((finish) => {
    dns.lookup(host, { all: true })
      .then((addrs) => finish(true, { addresses: addrs.map((a) => a.address) }))
      .catch((err) => finish(false, { error: err.code || err.message }))
  })
  const ipv4 = result.dns.addresses?.find((a) => net.isIPv4(a))
  if (!ipv4) return result

  result.tcp = await step((finish) => {
    const sock = net.connect({ host: ipv4, port: 443 })
    sock.once('connect', () => { finish(true, { ip: ipv4 }); sock.destroy() })
    sock.once('error', (err) => { finish(false, { ip: ipv4, error: err.code || err.message }); sock.destroy() })
    setTimeout(() => sock.destroy(), STEP_TIMEOUT_MS + 100)
  })
  if (!result.tcp.ok) return result

  result.tls = await step((finish) => {
    const sock = tls.connect({ host: ipv4, port: 443, servername: host })
    sock.once('secureConnect', () => { finish(true); sock.destroy() })
    sock.once('error', (err) => { finish(false, { error: err.code || err.message }); sock.destroy() })
    setTimeout(() => sock.destroy(), STEP_TIMEOUT_MS + 100)
  })
  if (!result.tls.ok) return result

  result.http = await step((finish) => {
    const req = https.get({ host, path: '/', family: 4, headers: { 'User-Agent': 'pischool-diagnostic' } }, (res) => {
      finish(true, { status: res.statusCode })
      res.resume()
    })
    req.once('error', (err) => finish(false, { error: err.code || err.message }))
    setTimeout(() => req.destroy(), STEP_TIMEOUT_MS + 100)
  })

  return result
}

export async function diagnoseTelegramNetwork() {
  const [telegram, control] = await Promise.all([probeHost('api.telegram.org'), probeHost('api.github.com')])
  return {
    at: new Date().toISOString(),
    region: process.env.VERCEL_REGION || null,
    node: process.version,
    telegram,
    control,
  }
}

function failure(err) {
  const code = err.code || err.name || 'ERROR'
  return {
    ok: false,
    code,
    description: `Conexiunea la api.telegram.org a eșuat (${code}${err.message ? `: ${err.message}` : ''})`,
  }
}

import https from 'node:https'

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

function failure(err) {
  const code = err.code || err.name || 'ERROR'
  return {
    ok: false,
    code,
    description: `Conexiunea la api.telegram.org a eșuat (${code}${err.message ? `: ${err.message}` : ''})`,
  }
}

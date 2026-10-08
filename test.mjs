// Does Windows hand a long custom-protocol link to its handler intact?
// Registers jbtest:// with the `"exe" "%1"` command shape an NSIS-installed
// Electron app gets, launches links of several lengths through the shell and
// through Chrome and Edge, and reports what the handler received.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(os.tmpdir(), 'jbtest-out')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const LENGTHS = [
  1002, 2000, 2083, 2084, 2943, 4096, 8191, 8192, 11218, 20000, 32000, 40000,
]

// Shaped like a real figure link: a web url whose session is percent-encoded
// JSON, wrapped whole as one encoded parameter.
function linkOf(id, length) {
  const head = `jbtest://open?id=${id}&url=`
  const web = (n) =>
    `https://jbrowse.org/code/jb2/main/?config=test_data%2Fvolvox%2Fconfig.json&session=spec-${encodeURIComponent(
      JSON.stringify({ views: [{ type: 'LinearGenomeView', pad: 'x'.repeat(n) }] }),
    )}`
  const base = head + encodeURIComponent(web(0))
  if (base.length > length) {
    throw new Error(`length ${length} is under the shortest link`)
  }
  return head + encodeURIComponent(web(length - base.length))
}

function reg(...args) {
  execFileSync('reg', args, { stdio: 'pipe' })
}

const node = process.execPath
const command = `"${node}" "${path.join(here, 'handler.js')}" "${outDir}" "%1"`
reg('add', 'HKCU\\Software\\Classes\\jbtest', '/ve', '/d', 'URL:jbtest', '/f')
reg('add', 'HKCU\\Software\\Classes\\jbtest', '/v', 'URL Protocol', '/d', '', '/f')
reg('add', 'HKCU\\Software\\Classes\\jbtest\\shell\\open\\command', '/ve', '/d', command, '/f')

const policy = '[{"allowed_origins":["*"],"protocol":"jbtest"}]'
for (const key of [
  'HKLM\\SOFTWARE\\Policies\\Google\\Chrome',
  'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge',
]) {
  try {
    reg('add', key, '/v', 'AutoLaunchProtocolsFromOrigins', '/t', 'REG_SZ', '/d', policy, '/f')
  } catch (e) {
    console.log(`could not set policy at ${key}: ${e.message}`)
  }
}

async function received(id, sent, timeoutMs = 12000) {
  const file = path.join(outDir, `${id}.txt`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      await new Promise(r => setTimeout(r, 200))
      const got = fs.readFileSync(file, 'utf8')
      return {
        got: got.length,
        verdict:
          got === sent
            ? 'intact'
            : sent.startsWith(got)
              ? 'TRUNCATED'
              : got.length === sent.length
                ? 'same length, altered'
                : 'altered',
      }
    }
    await new Promise(r => setTimeout(r, 250))
  }
  return { got: 0, verdict: 'never arrived' }
}

const rows = []
async function record(via, tag, length, launch) {
  const id = `${tag}-${length}`
  const sent = linkOf(id, length)
  let note = ''
  try {
    await launch(sent)
  } catch (e) {
    note = String(e.message ?? e).split('\n')[0].slice(0, 120)
  }
  const { got, verdict } = await received(id, sent, note ? 3000 : 12000)
  rows.push({ via, sent: sent.length, got, verdict, note })
  console.log(via, sent.length, got, verdict, note)
}

// 1. the shell: ShellExecuteEx, which is what the 2083 suspicion is about
for (const length of LENGTHS) {
  await record('Start-Process (ShellExecute)', 'ps', length, sent => {
    const r = spawnSync(
      'powershell',
      ['-NoProfile', '-Command', 'Start-Process -FilePath $env:JBTEST_LINK'],
      { env: { ...process.env, JBTEST_LINK: sent }, encoding: 'utf8' },
    )
    if (r.status !== 0) {
      throw new Error((r.stderr || r.error?.message || 'failed').trim())
    }
  })
}

// 2. rundll32 url.dll, the launcher many desktop apps use for links
for (const length of LENGTHS) {
  await record('rundll32 url.dll', 'rd', length, sent => {
    const r = spawnSync('rundll32', ['url.dll,FileProtocolHandler', sent], {
      encoding: 'utf8',
    })
    if (r.error) {
      throw r.error
    }
  })
}

// 3. a real click on a link in a page, in each browser
const links = new Map()
const server = http.createServer((req, res) => {
  const key = new URL(req.url, 'http://x').searchParams.get('k')
  res.setHeader('content-type', 'text/html')
  res.end(
    `<!doctype html><a id="l" href="${(links.get(key) ?? '').replaceAll('&', '&amp;')}">open</a>`,
  )
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const BROWSERS = {
  Chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  Edge: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}
for (const [name, candidates] of Object.entries(BROWSERS)) {
  const executablePath = candidates.find(p => fs.existsSync(p))
  if (!executablePath) {
    rows.push({ via: `${name} click`, sent: 0, got: 0, verdict: 'not installed', note: '' })
    continue
  }
  const browser = await puppeteer.launch({ executablePath, headless: false })
  console.log(name, await browser.version())
  for (const length of LENGTHS) {
    await record(`${name} click`, name.toLowerCase(), length, async sent => {
      const key = `${name}-${length}`
      links.set(key, sent)
      const page = await browser.newPage()
      await page.goto(`http://127.0.0.1:${port}/?k=${key}`)
      await page.click('#l')
      await new Promise(r => setTimeout(r, 1500))
      await page.close()
    })
  }
  await browser.close()
}
server.close()

const table = [
  '| Launched through | Sent | Received | Result | Note |',
  '|---|---|---|---|---|',
  ...rows.map(r => `| ${r.via} | ${r.sent} | ${r.got} | ${r.verdict} | ${r.note} |`),
].join('\n')
const osLine = execFileSync('cmd', ['/c', 'ver'], { encoding: 'utf8' }).trim()
const report = `## Custom-protocol link length on Windows\n\n${osLine}\n\n${table}\n`
console.log(report)
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
}
fs.writeFileSync(path.join(here, 'results.md'), report)

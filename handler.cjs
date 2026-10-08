// Registered as the jbtest:// handler: writes the link it was handed to
// <outDir>/<id>.txt, where id is the link's own `id` parameter.
const fs = require('node:fs')
const path = require('node:path')

const [outDir, link = ''] = process.argv.slice(2)
const id = /[?&]id=([\w-]+)/.exec(link)?.[1] ?? `unparsed-${Date.now()}`
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, `${id}.txt`), link)

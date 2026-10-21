import process from 'node:process'
import { build } from 'vite'
import { gzipSync } from 'node:zlib'
import { mkdir, writeFile, readFile } from 'node:fs/promises'

const label = process.argv[2] || 'after'
if (!/^[a-z-]+$/.test(label)) throw new Error('Use a simple report label')
const normalize = (id) =>
  id.replaceAll('\\', '/').replace(process.cwd().replaceAll('\\', '/') + '/', '')
const packageName = (id) =>
  id.includes('/node_modules/')
    ? id
        .split('/node_modules/')
        .at(-1)
        .split('/')
        .slice(0, id.split('/node_modules/').at(-1).startsWith('@') ? 2 : 1)
        .join('/')
    : 'application'
await build({
  build: { manifest: true },
  plugins: [
    {
      name: 'bundle-composition-report',
      async writeBundle(options, bundle) {
        const chunks = await Promise.all(
          Object.values(bundle)
            .filter((item) => item.type === 'chunk')
            .map(async (chunk) => {
              const emitted = await readFile(`${options.dir}/${chunk.fileName}`)
              const modules = Object.entries(chunk.modules)
                .filter(([, info]) => info.renderedLength > 0)
                .map(([id, info]) => ({ id: normalize(id), renderedBytes: info.renderedLength }))
                .sort((a, b) => b.renderedBytes - a.renderedBytes)
              const packages = {}
              for (const module of modules) {
                const name = packageName(module.id)
                packages[name] = (packages[name] || 0) + module.renderedBytes
              }
              return {
                file: chunk.fileName,
                name: chunk.name,
                entry: chunk.isEntry,
                facade: chunk.facadeModuleId && normalize(chunk.facadeModuleId),
                bytes: emitted.byteLength,
                gzipBytes: gzipSync(emitted).byteLength,
                imports: chunk.imports,
                dynamicImports: chunk.dynamicImports,
                packages: Object.fromEntries(Object.entries(packages).sort((a, b) => b[1] - a[1])),
                modules,
              }
            }),
        )
        chunks.sort((a, b) => b.bytes - a.bytes)
        await mkdir('docs/bundle', { recursive: true })
        await writeFile(
          `docs/bundle/${label}.json`,
          JSON.stringify(
            {
              note: 'bytes/gzipBytes are final chunk sizes; module/package renderedBytes are Rollup pre-minification contributions, not compressed sizes.',
              chunks,
            },
            null,
            2,
          ) + '\n',
        )
        console.log(`Bundle composition: docs/bundle/${label}.json`)
      },
    },
  ],
})

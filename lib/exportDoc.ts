// Download de texto como .txt e .docx — sem nenhuma dependência externa.
// O .docx é um ZIP (método STORE, sem compressão) montado à mão com CRC32.

function baixarBlob(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Nome de arquivo seguro a partir de um título livre.
export function slugArquivo(s: string): string {
  return (s || 'transcricao')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'transcricao'
}

export function baixarTxt(nomeBase: string, texto: string) {
  baixarBlob(`${slugArquivo(nomeBase)}.txt`, new Blob([texto], { type: 'text/plain;charset=utf-8' }))
}

// ---------- .docx real (Office Open XML mínimo) ----------

function crc32(bytes: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

const enc = new TextEncoder()
function u16(n: number) { return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]) }
function u32(n: number) { return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]) }
function concat(arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((a, b) => a + b.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

function zipStore(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const locais: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const nome = enc.encode(e.name)
    const crc = crc32(e.data)
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(e.data.length), u32(e.data.length),
      u16(nome.length), u16(0), nome, e.data,
    ])
    locais.push(local)
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(e.data.length), u32(e.data.length),
      u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nome,
    ]))
    offset += local.length
  }
  const centralData = concat(central)
  const fim = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralData.length), u32(offset), u16(0),
  ])
  return concat([...locais, centralData, fim])
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function paragrafo(texto: string, opts?: { bold?: boolean; sz?: number }): string {
  const rpr = opts?.bold || opts?.sz
    ? `<w:rPr>${opts?.bold ? '<w:b/>' : ''}${opts?.sz ? `<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>` : ''}</w:rPr>`
    : ''
  return `<w:p><w:r>${rpr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`
}

export function baixarDocx(nomeBase: string, titulo: string, texto: string) {
  const linhas = texto.split(/\r?\n/)
  const corpo = [paragrafo(titulo, { bold: true, sz: 32 }), paragrafo('')]
    .concat(linhas.map((l) => paragrafo(l)))
    .join('')

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    corpo +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>` +
    `</w:body></w:document>`

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`

  const zip = zipStore([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
  ])

  baixarBlob(`${slugArquivo(nomeBase)}.docx`, new Blob([zip as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }))
}

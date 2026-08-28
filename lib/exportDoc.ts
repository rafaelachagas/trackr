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

export function baixarMd(nomeBase: string, titulo: string, texto: string) {
  const md = `# ${titulo}\n\n${texto}\n`
  baixarBlob(`${slugArquivo(nomeBase)}.md`, new Blob([md], { type: 'text/markdown;charset=utf-8' }))
}

// ---------- .pdf real (montado à mão, fonte Helvetica padrão) ----------
// PT-BR cabe no Latin-1, que é o que as fontes padrão do PDF entendem —
// caracteres fora disso (emoji etc.) viram '?'.

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out[i] = c <= 0xff ? c : 63 // '?'
  }
  return out
}

// Quebra o texto em linhas de no máximo `max` caracteres, respeitando \n.
function quebrarLinhas(texto: string, max: number): string[] {
  const out: string[] = []
  for (const par of texto.split(/\r?\n/)) {
    if (!par.trim()) { out.push(''); continue }
    let linha = ''
    for (const palavra of par.split(/\s+/)) {
      if (!linha) linha = palavra
      else if ((linha + ' ' + palavra).length <= max) linha += ' ' + palavra
      else { out.push(linha); linha = palavra }
    }
    if (linha) out.push(linha)
  }
  return out
}

export function baixarPdf(nomeBase: string, titulo: string, texto: string) {
  const linhas = quebrarLinhas(texto, 95)
  const LEADING = 16
  const TOPO = 792         // y inicial (A4 = 842pt de altura, margem 50)
  const RODAPE = 50
  const porPagina = Math.floor((TOPO - RODAPE) / LEADING)

  // Página 1 reserva 3 linhas pro título.
  const paginas: string[][] = []
  let resto = [...linhas]
  paginas.push(resto.splice(0, Math.max(porPagina - 3, 1)))
  while (resto.length) paginas.push(resto.splice(0, porPagina))

  const streams = paginas.map((lns, i) => {
    let s = `BT /F1 11 Tf ${LEADING} TL 50 ${TOPO} Td\n`
    if (i === 0) s += `/F2 14 Tf (${pdfEscape(titulo)}) Tj T* T* /F1 11 Tf\n`
    for (const l of lns) s += `(${pdfEscape(l)}) Tj T*\n`
    s += 'ET'
    return s
  })

  // Objetos: 1 Catalog · 2 Pages · 3 F1 · 4 F2 · depois, por página: Page + Contents.
  const nPag = paginas.length
  const kids = paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ')
  const objs: string[] = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${nPag} >>\nendobj\n`,
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
  ]
  streams.forEach((st, i) => {
    const pageNum = 5 + i * 2
    objs.push(`${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNum + 1} 0 R >>\nendobj\n`)
    objs.push(`${pageNum + 1} 0 obj\n<< /Length ${latin1(st).length} >>\nstream\n${st}\nendstream\nendobj\n`)
  })

  let corpo = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const o of objs) { offsets.push(corpo.length); corpo += o }
  const xrefPos = corpo.length
  corpo += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) corpo += `${String(off).padStart(10, '0')} 00000 n \n`
  corpo += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`

  baixarBlob(`${slugArquivo(nomeBase)}.pdf`, new Blob([latin1(corpo) as unknown as BlobPart], { type: 'application/pdf' }))
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

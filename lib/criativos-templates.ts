// Templates de edição — o "jeito" do vídeo. Os valores de verdade ficam na VPS
// (vps-transcritor/app.py → TEMPLATES); aqui é só o rótulo pro usuário escolher.
// Template novo: entrada nos dois lugares, com a MESMA chave.

export const TEMPLATES = [
  {
    id: 'ugc_cru',
    nome: 'UGC cru',
    desc: 'Corte seco, sem zoom, legenda palavra a palavra em amarelo. Parece vídeo de celular.',
    ritmo: 'b-roll a cada 2-3,5s',
  },
  {
    id: 'produzido',
    nome: 'Produzido',
    desc: 'Zoom lento, entrada em fade, frase com a palavra falada acesa em laranja.',
    ritmo: 'b-roll a cada 3-5s',
  },
  {
    id: 'vsl_agressivo',
    nome: 'VSL agressivo',
    desc: 'Corte rápido com flash branco, zoom leve, legenda em bloco. Ritmo de VSL.',
    ritmo: 'b-roll a cada 1,5-2,5s',
  },
] as const

export type TemplateId = (typeof TEMPLATES)[number]['id']
export const TEMPLATE_PADRAO: TemplateId = 'ugc_cru'

// Estilo de legenda que cada template usa (o seletor de legenda acompanha a
// escolha do template, e o usuário ainda pode trocar depois).
export const ESTILO_DO_TEMPLATE: Record<TemplateId, 'palavra' | 'destaque' | 'bloco'> = {
  ugc_cru: 'palavra',
  produzido: 'destaque',
  vsl_agressivo: 'bloco',
}

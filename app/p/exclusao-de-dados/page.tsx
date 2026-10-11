import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL_CONTATO, LEGAL_ATUALIZADO } from '../legal'

export const metadata: Metadata = { title: 'Exclusão de dados — The Track' }

export default function ExclusaoDeDados() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-bold mb-1">Exclusão de dados</h1>
      <p className="text-muted-foreground mb-8">The Track · atualizada em {LEGAL_ATUALIZADO}</p>

      <p>Você pode pedir a exclusão dos seus dados tratados pelo The Track a qualquer momento.</p>

      <h2 className="text-base font-bold mt-6 mb-2">Como pedir</h2>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Envie um e-mail para <a href={`mailto:${LEGAL_CONTATO}?subject=Exclus%C3%A3o%20de%20dados`} className="text-primary underline">{LEGAL_CONTATO}</a> com o assunto <b>“Exclusão de dados”</b>.</li>
        <li>Informe o e-mail (ou o número de WhatsApp) associado aos dados que devem ser apagados.</li>
        <li>Confirmamos o recebimento e concluímos a exclusão em até 15 dias, avisando por e-mail.</li>
      </ol>

      <h2 className="text-base font-bold mt-6 mb-2">O que é apagado</h2>
      <p>Sua conta de acesso, seus dados de contato e os registros ligados a você. Podem ser mantidos apenas os dados que a lei obriga a guardar (por exemplo, registros fiscais de transações), pelo prazo legal.</p>

      <h2 className="text-base font-bold mt-6 mb-2">Acesso concedido pelo Facebook</h2>
      <p>Para remover o acesso do The Track à sua conta da Meta, abra no Facebook <b>Configurações e privacidade → Configurações → Integrações comerciais</b> (ou <b>Apps e sites</b>), selecione o app <b>Trackr</b> e clique em <b>Remover</b>. Para apagar também o que já foi coletado, faça o pedido por e-mail como descrito acima.</p>

      <p className="mt-8">Veja também a <Link href="/p/privacidade" className="text-primary underline">Política de Privacidade</Link>.</p>
    </main>
  )
}

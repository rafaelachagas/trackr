import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL_CONTATO, LEGAL_ATUALIZADO } from '../legal'

export const metadata: Metadata = { title: 'Política de Privacidade — The Track' }

export default function Privacidade() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-bold mb-1">Política de Privacidade</h1>
      <p className="text-muted-foreground mb-8">The Track · atualizada em {LEGAL_ATUALIZADO}</p>

      <h2 className="text-base font-bold mt-6 mb-2">1. O que é o The Track</h2>
      <p>O The Track é uma ferramenta interna de acompanhamento de anúncios e vendas. Ela é usada apenas pela equipe autorizada do negócio, mediante login. Não é um produto aberto ao público.</p>

      <h2 className="text-base font-bold mt-6 mb-2">2. Dados que tratamos</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><b>Dados de acesso da equipe:</b> nome, e-mail e senha (armazenada de forma cifrada) de quem usa o painel.</li>
        <li><b>Dados de anúncios (Meta):</b> contas de anúncio, campanhas, conjuntos, anúncios, criativos e métricas (gasto, impressões, cliques), obtidos pela API de Marketing da Meta com autorização do titular da conta.</li>
        <li><b>Dados de vendas:</b> transações recebidas da plataforma de pagamento (produto, valor, status, e-mail do comprador e código de rastreio), usados para atribuir cada venda ao anúncio de origem.</li>
        <li><b>Mensagens do WhatsApp:</b> comandos enviados ao bot do The Track pelos números autorizados e, nos grupos em que a função foi ligada, o conteúdo necessário para gerar transcrições e resumos.</li>
      </ul>

      <h2 className="text-base font-bold mt-6 mb-2">3. Para que usamos</h2>
      <p>Para medir o desempenho dos anúncios, calcular retorno sobre o investimento, criar e gerenciar campanhas nas contas de anúncio autorizadas e enviar relatórios à equipe. Não vendemos dados nem os usamos para publicidade de terceiros.</p>

      <h2 className="text-base font-bold mt-6 mb-2">4. Dados obtidos da Meta</h2>
      <p>O acesso à Meta é feito com as permissões concedidas pelo titular das contas de anúncio. Usamos esses dados somente dentro do The Track, para as finalidades acima. O acesso pode ser revogado a qualquer momento nas configurações de integrações comerciais do Facebook.</p>

      <h2 className="text-base font-bold mt-6 mb-2">5. Compartilhamento</h2>
      <p>Os dados ficam em provedores de infraestrutura contratados para operar a ferramenta (hospedagem, banco de dados e envio de mensagens), que os tratam em nosso nome. Não há compartilhamento com outros terceiros, salvo obrigação legal.</p>

      <h2 className="text-base font-bold mt-6 mb-2">6. Guarda e segurança</h2>
      <p>O acesso é restrito por login e por perfil de usuário. Mantemos os dados enquanto forem necessários para a operação ou até o pedido de exclusão.</p>

      <h2 className="text-base font-bold mt-6 mb-2">7. Seus direitos</h2>
      <p>Você pode pedir acesso, correção ou exclusão dos seus dados, nos termos da LGPD (Lei 13.709/2018). Veja como em <Link href="/p/exclusao-de-dados" className="text-primary underline">Exclusão de dados</Link>.</p>

      <h2 className="text-base font-bold mt-6 mb-2">8. Contato</h2>
      <p>Dúvidas sobre esta política: <a href={`mailto:${LEGAL_CONTATO}`} className="text-primary underline">{LEGAL_CONTATO}</a>.</p>
    </main>
  )
}

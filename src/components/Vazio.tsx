import type { ReactNode } from 'react';

/** Estado vazio explícito (seção 10): diz em palavras o que falta. */
export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <h3>{titulo}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function CabecalhoTela({ eyebrow, titulo, lead, acoes }: { eyebrow?: string; titulo: string; lead?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="view-head">
      <div className="hello">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{titulo}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {acoes}
    </div>
  );
}

/** Tela reservada para um pacote de trabalho que ainda não foi entregue. */
export function EmConstrucao({ titulo, eyebrow, lead, versao }: { titulo: string; eyebrow?: string; lead?: string; versao: 'V1' | 'V2' }) {
  return (
    <section className="view">
      <CabecalhoTela eyebrow={eyebrow} titulo={titulo} lead={lead} />
      <Vazio titulo={versao === 'V2' ? 'Chega na versão 2' : 'Em construção'}>
        {versao === 'V2' ? 'Esta tela entra na fase "Crescer e medir".' : 'Esta tela está sendo montada agora.'}
      </Vazio>
    </section>
  );
}

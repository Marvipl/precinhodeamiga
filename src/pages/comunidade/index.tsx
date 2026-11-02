// Aba Comunidade. O pacote da Comunidade (caixa de mensagens, pedidos, regras da Atendente) completa a
// coluna da esquerda; o Crescimento da semana e o conteúdo extra da Redatora ficam em Crescimento.tsx.
import { CabecalhoTela, Vazio } from '@/components/Vazio';
import Crescimento from './Crescimento';

export default function Pagina() {
  return (
    <section className="view">
      <CabecalhoTela eyebrow="Pedidos e crescimento" titulo="Comunidade" lead="Mensagens, pedidos das amigas e táticas de crescimento." />
      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Caixa de mensagens</h2>
              </div>
            </div>
            <Vazio titulo="Em construção">A caixa de mensagens e os pedidos das amigas estão sendo montados agora.</Vazio>
          </div>
        </div>
        <Crescimento />
      </div>
    </section>
  );
}

// F-11 Registro de tempo: começar e encerrar, lista das sessões, lançamento e correção manual, montagem.
import { useMemo, useState, type FormEvent } from 'react';
import { CONFIG } from '@core/config.ts';
import { dataCurta, dataLocal, diaDaSemana, horaLocal, instanteLocal, somarDias } from '@core/formato.ts';
import { duracaoMin, duracaoTexto, horasMontagem, horasValidas, validarSessaoManual } from '@core/tempo.ts';
import { useConfig } from '@/lib/config';
import { useToast } from '@/components/Toast';
import {
  inicioDoMes,
  useAlterarSessao,
  useApagarSessao,
  useComecarSessao,
  useEncerrarSessao,
  useLancarSessao,
  useMinhasSessoes,
  type SessaoLinha,
} from './sessoes';

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function horasTexto(h: number): string {
  return duracaoTexto(Math.round(h * 60));
}

interface Rascunho {
  id: string | null;
  data: string;
  inicio: string;
  fim: string;
  montagem: boolean;
  nota: string;
}

function rascunhoDe(s: SessaoLinha | null): Rascunho {
  if (!s) {
    const agora = new Date();
    return { id: null, data: dataLocal(agora), inicio: '', fim: horaLocal(agora), montagem: false, nota: '' };
  }
  return {
    id: s.id,
    data: dataLocal(new Date(s.inicio)),
    inicio: horaLocal(new Date(s.inicio)),
    fim: s.fim ? horaLocal(new Date(s.fim)) : '',
    montagem: s.montagem,
    nota: s.nota ?? '',
  };
}

/** Fim antes do início no mesmo formulário = passou da meia-noite. */
function intervaloDo(r: Rascunho): { inicio: string; fim: string } | null {
  if (!r.data || !r.inicio || !r.fim) return null;
  const ini = instanteLocal(r.data, r.inicio);
  let fim = instanteLocal(r.data, r.fim);
  if (fim <= ini) fim = instanteLocal(somarDias(r.data, 1), r.fim);
  return { inicio: ini.toISOString(), fim: fim.toISOString() };
}

export function RegistroDeTempo({ userId }: { userId: string | undefined }) {
  const toast = useToast();
  const { data: cfg } = useConfig();
  const horasInativa = cfg?.sessaoInativaHoras ?? CONFIG.sessaoInativaHoras.padrao;
  const { data: sessoes = [], isLoading } = useMinhasSessoes(userId);
  const comecar = useComecarSessao(userId);
  const encerrar = useEncerrarSessao();
  const alterar = useAlterarSessao();
  const lancar = useLancarSessao(userId);
  const apagar = useApagarSessao();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const aberta = sessoes.find((s) => !s.fim) ?? null;
  const aConfirmar = sessoes.filter((s) => s.fechada_automaticamente && !s.confirmada_em);
  const agora = new Date();
  const mes = useMemo(() => {
    const de = inicioDoMes();
    const ate = new Date(8.64e15);
    return { validas: horasValidas(sessoes, de, ate), montagem: horasMontagem(sessoes, de, ate) };
  }, [sessoes]);

  const falhou = (e: unknown) => toast((e as Error).message);

  function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!rascunho) return;
    const intervalo = intervaloDo(rascunho);
    if (!intervalo) {
      setErro('Informe a data, o início e o fim.');
      return;
    }
    const outras = sessoes.filter((s) => s.id !== rascunho.id);
    const msg = validarSessaoManual(intervalo, outras, new Date());
    if (msg) {
      setErro(msg);
      return;
    }
    const nota = rascunho.nota.trim() || null;
    const fim = () => {
      setRascunho(null);
      setErro(null);
    };
    if (rascunho.id) {
      alterar.mutate(
        { id: rascunho.id, campos: { ...intervalo, montagem: rascunho.montagem, nota, confirmada_em: new Date().toISOString() } },
        { onSuccess: () => (fim(), toast('Sessão corrigida.')), onError: falhou },
      );
    } else {
      lancar.mutate({ ...intervalo, montagem: rascunho.montagem, nota }, { onSuccess: () => (fim(), toast('Sessão lançada.')), onError: falhou });
    }
  }

  return (
    <div className="card" id="registro-de-tempo">
      <div className="card-head">
        <div>
          <h2>Registro de tempo</h2>
          <p>Só o tempo marcado como montagem fica fora da comissão por hora.</p>
        </div>
      </div>

      {aConfirmar.map((s) => (
        <div className="aviso hoje-aviso" role="note" key={s.id}>
          <span>
            A sessão de {dataCurta(dataLocal(new Date(s.inicio)))} ({horaLocal(new Date(s.inicio))} às {s.fim ? horaLocal(new Date(s.fim)) : ''}) fechou sozinha
            depois de {horasInativa} {horasInativa === 1 ? 'hora' : 'horas'} sem uso, no último toque registrado. Está certo?
          </span>
          <span className="hoje-acoes">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => alterar.mutate({ id: s.id, campos: { confirmada_em: new Date().toISOString() } }, { onError: falhou })}
            >
              Está certo
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setRascunho(rascunhoDe(s)), setErro(null))}>
              Corrigir
            </button>
          </span>
        </div>
      ))}

      <div className="hoje-sessao">
        {aberta ? (
          <>
            <div>
              <div className="hoje-sessao-t">Sessão aberta desde {horaLocal(new Date(aberta.inicio))}</div>
              <div className="small muted">{duracaoTexto(duracaoMin(aberta, agora))} até agora</div>
            </div>
            <label className="hoje-check">
              <input
                type="checkbox"
                checked={aberta.montagem}
                onChange={(e) => alterar.mutate({ id: aberta.id, campos: { montagem: e.target.checked } }, { onError: falhou })}
              />
              <span>É montagem</span>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={encerrar.isPending}
              onClick={() => encerrar.mutate({ id: aberta.id }, { onSuccess: () => toast('Sessão encerrada.'), onError: falhou })}
            >
              Encerrar sessão
            </button>
          </>
        ) : (
          <>
            <div>
              <div className="hoje-sessao-t">Nenhuma sessão aberta</div>
              <div className="small muted">Registrar desde o dia 1 é exigência do plano.</div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={comecar.isPending}
              onClick={() => comecar.mutate(undefined, { onSuccess: () => toast('Sessão começou. Bom trabalho.'), onError: falhou })}
            >
              Começar sessão
            </button>
          </>
        )}
      </div>

      <p className="small muted hoje-total">
        Este mês: {horasTexto(mes.validas)} de operação{mes.montagem > 0 ? ` e ${horasTexto(mes.montagem)} de montagem` : ''}.
      </p>

      {rascunho ? (
        <form className="hoje-form" onSubmit={salvar} aria-label={rascunho.id ? 'Corrigir sessão' : 'Lançar sessão'}>
          <div className="hoje-form-linha">
            <label className="field">
              <span>Data</span>
              <input className="input" type="date" value={rascunho.data} max={dataLocal()} onChange={(e) => setRascunho({ ...rascunho, data: e.target.value })} required />
            </label>
            <label className="field">
              <span>Início</span>
              <input className="input" type="time" value={rascunho.inicio} onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })} required />
            </label>
            <label className="field">
              <span>Fim</span>
              <input className="input" type="time" value={rascunho.fim} onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value })} required />
            </label>
          </div>
          <label className="field">
            <span>Nota (opcional)</span>
            <input
              className="input"
              type="text"
              value={rascunho.nota}
              placeholder="Ex.: respondi o canal pelo celular"
              onChange={(e) => setRascunho({ ...rascunho, nota: e.target.value })}
            />
          </label>
          <label className="hoje-check">
            <input type="checkbox" checked={rascunho.montagem} onChange={(e) => setRascunho({ ...rascunho, montagem: e.target.checked })} />
            <span>É montagem (cadastro, marca, criação dos canais, planilhas)</span>
          </label>
          {erro ? (
            <p className="aviso erro" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="hoje-acoes">
            <button type="submit" className="btn btn-primary" disabled={alterar.isPending || lancar.isPending}>
              {rascunho.id ? 'Salvar correção' : 'Lançar sessão'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => (setRascunho(null), setErro(null))}>
              Cancelar
            </button>
            {rascunho.id ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  apagar.mutate({ id: rascunho.id as string }, { onSuccess: () => (setRascunho(null), toast('Sessão apagada.')), onError: falhou })
                }
              >
                Apagar sessão
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => (setRascunho(rascunhoDe(null)), setErro(null))}>
          Lançar tempo manualmente
        </button>
      )}

      <h3 className="hoje-sub">Suas sessões</h3>
      {isLoading ? (
        <p className="carregando">Carregando...</p>
      ) : sessoes.length === 0 ? (
        <p className="small muted">Nenhuma sessão registrada ainda.</p>
      ) : (
        <ul className="reqs hoje-sessoes">
          {sessoes.map((s) => {
            const dia = dataLocal(new Date(s.inicio));
            return (
              <li key={s.id}>
                <span className="txt">
                  <b>
                    {DIAS_CURTOS[diaDaSemana(dia)]}, {dataCurta(dia)}
                  </b>{' '}
                  {horaLocal(new Date(s.inicio))} às {s.fim ? horaLocal(new Date(s.fim)) : 'agora'} · {duracaoTexto(duracaoMin(s, agora))}
                  {s.nota ? <span className="small muted"> · {s.nota}</span> : null}
                </span>
                {s.montagem ? <span className="pill pill-plum">Montagem</span> : null}
                {s.manual ? <span className="pill pill-std">Lançada</span> : null}
                {s.fechada_automaticamente ? <span className="pill pill-warn">Fechou sozinha</span> : null}
                {s.fim ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setRascunho(rascunhoDe(s)), setErro(null))}>
                    Corrigir
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

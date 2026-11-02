import { describe, expect, it } from 'vitest';
import { avaliarSuporte, chaveParaBytes, rotuloDispositivo, type Ambiente } from './notificacoes';

const base: Ambiente = { chave: 'BPx', temServiceWorker: true, temPush: true, ios: false, instalado: false, permissao: 'default' };

describe('suporte a notificações no aparelho', () => {
  it('pede a chave antes de tudo', () => expect(avaliarSuporte({ ...base, chave: '' })).toBe('sem_chave'));
  it('iPhone precisa do app na tela inicial', () => {
    expect(avaliarSuporte({ ...base, ios: true, temPush: false })).toBe('instalar_ios');
    expect(avaliarSuporte({ ...base, ios: true, instalado: true })).toBe('pronto');
  });
  it('navegador sem push', () => expect(avaliarSuporte({ ...base, temPush: false })).toBe('sem_suporte'));
  it('permissão bloqueada', () => expect(avaliarSuporte({ ...base, permissao: 'denied' })).toBe('bloqueado'));
  it('pronto', () => expect(avaliarSuporte(base)).toBe('pronto'));
  it('chave base64url', () => expect(Array.from(chaveParaBytes('AQID_-8'))).toEqual([1, 2, 3, 255, 239]));
  it('rótulo do aparelho', () => {
    expect(rotuloDispositivo('Mozilla/5.0 (Linux; Android 14)')).toBe('Android');
    expect(rotuloDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
  });
});

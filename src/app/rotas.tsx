// Abas do painel (seção 4.1), nesta ordem. Cada tela vive em src/pages/<pasta>/index.tsx
// e é dona de um pacote de trabalho: troque o conteúdo da página, não esta lista.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { NomeIcone } from '@/components/Icone';

export interface Aba {
  caminho: string;
  rotulo: string;
  icone: NomeIcone;
  pagina: LazyExoticComponent<ComponentType>;
}

export const ABAS: Aba[] = [
  { caminho: '/', rotulo: 'Hoje', icone: 'home', pagina: lazy(() => import('@/pages/hoje')) },
  { caminho: '/ofertas', rotulo: 'Ofertas', icone: 'tag', pagina: lazy(() => import('@/pages/ofertas')) },
  { caminho: '/publicar', rotulo: 'Publicar', icone: 'send', pagina: lazy(() => import('@/pages/publicar')) },
  { caminho: '/radar', rotulo: 'Radar', icone: 'radar', pagina: lazy(() => import('@/pages/radar')) },
  { caminho: '/comunidade', rotulo: 'Comunidade', icone: 'users', pagina: lazy(() => import('@/pages/comunidade')) },
  { caminho: '/audiencia', rotulo: 'Audiência', icone: 'pulse', pagina: lazy(() => import('@/pages/audiencia')) },
  { caminho: '/resultados', rotulo: 'Resultados', icone: 'chart', pagina: lazy(() => import('@/pages/resultados')) },
  { caminho: '/plano', rotulo: 'Plano de 90 dias', icone: 'flag', pagina: lazy(() => import('@/pages/plano')) },
  { caminho: '/como-funciona', rotulo: 'Como funciona', icone: 'spark', pagina: lazy(() => import('@/pages/como-funciona')) },
];

export const PAGINA_CONFIGURACOES = lazy(() => import('@/pages/configuracoes'));

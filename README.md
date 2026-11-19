# Central de Notícias: portal

Portal de notícias de Embu das Artes, Taboão da Serra, Itapecerica da Serra e Zona Sul de SP.

- **Site:** Astro (SSR) na Netlify, com cache no CDN e purga automática a cada matéria nova.
- **Banco e mídia:** Supabase (`posts`, `ig_inbox`, `push_subscriptions`, bucket `media`).
- **Imagens:** Netlify Image CDN redimensiona e converte para WebP/AVIF a partir da capa original.

## Fluxo Instagram → site

1. A tarefa agendada lê os posts novos do Instagram e grava em `ig_inbox` (opcionalmente com a matéria reescrita em `article`).
2. Trigger → função `ig-import` converte a legenda em matéria (título, linha fina, corpo, cidade, editoria, SEO).
3. Trigger → função `media-ingest` baixa a capa para o bucket `media` (as URLs do Instagram expiram).
4. Trigger → `/api/revalidate` limpa o cache do site e `push-send` dispara o alerta para inscritos.

## Destaque fixo

```sql
update posts set pinned_until = now() + interval '2 days' where slug = '...';
```

## Desenvolvimento local

```sh
npm install
MOCK_DB=1 npm run dev   # usa src/lib/mock-posts.json
```

// Converts an Instagram caption written in the Central de Notícias house style into
// a structured web article. Pure functions: no Deno/Node APIs, so it runs in both
// the edge function and local tests.

export type IgPayload = {
  timestamp: string;
  media_type?: string | null;
  media_product_type?: string | null;
  media_permalink?: string | null;
  media_url?: string | null;
  media_thumbnail_url?: string | null;
  media_caption?: string | null;
};

export type Article = {
  title: string;
  subtitle: string | null;
  excerpt: string;
  body_html: string;
  city: string;
  category: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  cover_alt: string;
  is_breaking: boolean;
  location_label: string | null;
};

export const CITIES: Record<string, { name: string; patterns: RegExp[] }> = {
  embu: { name: "Embu das Artes", patterns: [/\bembu\b/i] },
  taboao: { name: "Taboão da Serra", patterns: [/tabo[aã]o/i] },
  itapecerica: { name: "Itapecerica da Serra", patterns: [/itapecerica/i] },
  "zona-sul": {
    name: "Zona Sul de SP",
    patterns: [/zona sul/i, /cap[aã]o redondo/i, /campo limpo/i, /m['’]?\s?boi mirim/i, /guarapiranga/i, /jardim [aâ]ngela/i, /carlos caldeira/i, /parque arariba/i, /santo amaro/i, /graja[uú]/i, /jardim s[aã]o lu[ií]s/i, /horizonte azul/i],
  },
  regiao: { name: "Região", patterns: [] },
};

export const CATEGORIES: Record<string, { name: string; patterns: RegExp[] }> = {
  policia: {
    name: "Polícia",
    patterns: [/\bpres[oa]s?\b/i, /\bpris[aã]o\b/i, /pol[ií]cia/i, /\bPM\b/, /\bGCM\b/, /\bROMU\b/i, /baleado/i, /assalt/i, /\broub/i, /furt/i, /suspeit/i, /homic[ií]dio/i, /feminic[ií]dio/i, /facad/i, /\bcorpo\b/i, /tr[aá]fico/i, /\bmort[oe]\b/i, /delegacia/i, /\bcrime/i, /agred/i, /agress/i, /indiciad/i, /desaparec/i, /\bfuga\b/i],
  },
  transito: { name: "Trânsito", patterns: [/acidente/i, /rodovia/i, /tr[aâ]nsito/i, /r[eé]gis bittencourt/i, /rodoanel/i, /colis[aã]o/i, /atropel/i, /congestionamento/i, /motociclista/i] },
  politica: { name: "Política", patterns: [/prefeit[oa]\b/i, /deputad/i, /vereador/i, /elei[cç]/i, /c[aâ]mara municipal/i, /\balesp\b/i, /candidat/i, /governador/i, /senador/i, /partido/i] },
  saude: { name: "Saúde", patterns: [/\bUBS\b/, /hospital/i, /\bUPA\b/, /sa[uú]de/i, /vacina/i, /dengue/i, /pronto-socorro/i] },
  educacao: { name: "Educação", patterns: [/escola/i, /\balunos?\b/i, /professor/i, /merenda/i, /educa[cç][aã]o/i, /creche/i] },
  eventos: { name: "Eventos e Cultura", patterns: [/\bevento\b/i, /\bshow/i, /festa/i, /festival/i, /gratuito/i, /\bfeira\b/i, /cultura/i, /exposi[cç][aã]o/i] },
  esportes: { name: "Esportes", patterns: [/futebol/i, /campeonato/i, /\btime\b/i, /\bjogo\b/i, /atleta/i, /esporte/i] },
  empregos: { name: "Empregos", patterns: [/vagas?\b/i, /emprego/i, /contrata/i, /concurso/i, /curr[ií]culo/i] },
  gastronomia: { name: "Gastronomia", patterns: [/restaurante/i, /churrascaria/i, /pizzaria/i, /gastronom/i, /card[aá]pio/i] },
  cidade: { name: "Cidade", patterns: [/obras?\b/i, /enchente/i, /chuva/i, /prefeitura/i, /bairro/i, /ilumina[cç][aã]o/i, /asfalto/i, /metr[oô]/i, /[oô]nibus/i, /abastecimento/i, /energia/i] },
  noticias: { name: "Notícias", patterns: [] },
};

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

export function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function slugify(s: string, max = 90): string {
  const base = stripEmoji(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  return cut.slice(0, cut.lastIndexOf("-") > 40 ? cut.lastIndexOf("-") : max).replace(/-+$/, "");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isUpperHeading(line: string): boolean {
  const t = stripEmoji(line).replace(/[:.!?]+$/, "").trim();
  if (t.length < 4 || t.length > 90) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4) return false;
  return letters === letters.toUpperCase();
}

/** Sentence-case a shouty headline for the <title>/SEO only when needed (keeps CAPS on page). */
export function sentenceCase(s: string): string {
  const lower = s.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

function pickBest(text: string, table: Record<string, { patterns: RegExp[] }>, fallback: string): string {
  let best = fallback;
  let bestScore = 0;
  for (const [key, { patterns }] of Object.entries(table)) {
    let score = 0;
    for (const p of patterns) {
      const m = text.match(new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g"));
      if (m) score += m.length;
    }
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(" ") > n * 0.6 ? cut.lastIndexOf(" ") : n - 1).replace(/[,;:\s]+$/, "") + "…";
}

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "a", "o"]);
export function titleCasePt(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join("");
}

/** Inline formatting: @handles become links to Instagram; URLs become links. */
function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" rel="nofollow noopener" target="_blank">${u}</a>`);
  out = out.replace(/(^|[\s(])@([A-Za-z0-9._]{2,30})/g, (_m, pre, h) => `${pre}<a href="https://www.instagram.com/${h.replace(/\.$/, "")}/" rel="nofollow noopener" target="_blank">@${h}</a>`);
  return out;
}

export function captionToArticle(caption: string): Article {
  const raw = (caption ?? "").replace(/\r/g, "").trim();
  const blocks = raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  // Title = first block's first line
  const firstLines = (blocks[0] ?? "").split("\n");
  let title = stripEmoji(firstLines[0] ?? "Notícia");
  const restOfFirst = firstLines.slice(1).join(" ").trim();
  const rest = blocks.slice(1);
  if (restOfFirst) rest.unshift(restOfFirst);
  const isBreaking = /^(urgente|exclusivo)\s*[:!-]/i.test(title);

  // Drop trailing hashtag-only blocks and the "📍 LOCAL" dateline (kept separately)
  let locationLabel: string | null = null;
  const body: string[] = [];
  for (const b of rest) {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    const kept: string[] = [];
    for (const l of lines) {
      if (/^📍/.test(l)) {
        locationLabel = stripEmoji(l).replace(/\s*\|\s*/g, " | ");
        continue;
      }
      const noTags = l.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "").trim();
      if (!noTags || /^(centraldenot[ií]cias)$/i.test(noTags)) continue;
      kept.push(l.replace(/(\s#[\p{L}\p{N}_]+)+\s*$/u, "").trim());
    }
    if (kept.length) body.push(kept.join("\n"));
  }

  // Subtitle: a short second paragraph directly under the title that isn't the lead
  let subtitle: string | null = null;
  if (body.length > 2) {
    const cand = body[0];
    const nextLonger = body[1].length > cand.length;
    // A real "linha fina" is short and doesn't read like the lead (no date/day-of-week reference)
    const looksLikeLead = /\(\d{1,2}\)|\bnest[ae]\s|\bneste\s|\bdest[ae]\s|\bontem\b|\bhoje\b/i.test(cand);
    if (cand.length <= 150 && !looksLikeLead && !cand.includes("\n") && !/^📢|^⚠️/.test(cand) && nextLonger && !isUpperHeading(cand)) {
      subtitle = stripEmoji(cand);
      body.shift();
    }
  }

  const html: string[] = [];
  for (const b of body) {
    const lines = b.split("\n");
    if (lines.length === 1 && isUpperHeading(lines[0])) {
      html.push(`<h2>${escapeHtml(stripEmoji(lines[0]).replace(/:$/, ""))}</h2>`);
      continue;
    }
    // Bulleted blocks (▪️ • - emoji-led lines)
    if (lines.length > 1 && lines.every((l) => /^(▪️|•|-|–|[\p{Extended_Pictographic}])/u.test(l))) {
      html.push("<ul>" + lines.map((l) => `<li>${inline(l.replace(/^(▪️|•|-|–)\s*/u, ""))}</li>`).join("") + "</ul>");
      continue;
    }
    if (lines.length > 1 && isUpperHeading(lines[0])) {
      html.push(`<h2>${escapeHtml(stripEmoji(lines[0]).replace(/:$/, ""))}</h2>`);
      lines.shift();
    }
    const text = lines.join(" ");
    const cls = /^📢/.test(text) ? ' class="cta"' : /^⚠️/.test(text) ? ' class="alerta"' : /^⚖️/.test(text) ? ' class="nota"' : "";
    html.push(`<p${cls}>${inline(text)}</p>`);
  }

  const firstPara = stripEmoji(subtitle ?? body.find((b) => !isUpperHeading(b) && b.length > 60) ?? title).replace(/\n/g, " ");
  const allText = `${title}\n${subtitle ?? ""}\n${body.join("\n")}\n${locationLabel ?? ""}`;
  const locText = `${title} ${locationLabel ?? ""}`;
  // Prefer the dateline / title for the city; fall back to the whole text
  let city = pickBest(locText, CITIES, "");
  if (!city) city = pickBest(allText, CITIES, "regiao");
  const category = pickBest(`${title}\n${title}\n${allText}`, CATEGORIES, "noticias");

  const tags = new Map<string, string>();
  const addTag = (t: string) => {
    const k = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.\s]+$/, "");
    if (k && !tags.has(k)) tags.set(k, t.replace(/[.\s]+$/, ""));
  };
  addTag(CITIES[city]?.name ?? "Região");
  if (locationLabel) {
    for (const part of locationLabel.split("|").map((p) => p.trim()).filter(Boolean)) {
      for (const sub of part.split(",").map((x) => x.trim()).filter(Boolean)) {
        if (sub.length <= 40) addTag(titleCasePt(sub));
      }
    }
  }

  const titleClean = title.replace(/^(urgente|exclusivo)\s*[:!-]\s*/i, "");
  return {
    title,
    subtitle,
    excerpt: truncate(subtitle ?? firstPara, 240),
    body_html: html.join("\n"),
    city,
    category,
    tags: [...tags.values()].slice(0, 6),
    seo_title: truncate(titleClean, 110),
    seo_description: truncate(firstPara, 158),
    cover_alt: truncate(titleClean, 140),
    is_breaking: isBreaking,
    location_label: locationLabel,
  };
}

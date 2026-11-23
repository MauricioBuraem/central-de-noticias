// Site-wide settings. Edit links here; empty strings hide that button.
export const SITE = {
  name: "Central de Notícias",
  shortName: "Central",
  // Fixed on purpose: PUBLIC_SITE_URL on Netlify still pointed at the old netlify.app address,
  // which put that address in canonicals, sitemaps and schema.
  url: "https://centraldenoticias24h.com",
  description:
    "Notícias de Embu das Artes, Taboão da Serra, Itapecerica da Serra e Zona Sul de São Paulo. Polícia, trânsito, política, cidade e serviços, 24 horas por dia.",
  locale: "pt_BR",
  lang: "pt-BR",
  publisher: "Central de Notícias",
  editor: "Redação Central de Notícias",
};

export const SUPABASE = {
  url: "https://gsdqhyltmjbzdgprblmy.supabase.co",
  // Publishable (public) key: read-only access to published posts, protected by RLS.
  key: "sb_publishable_58S9sFDmQUQ19f8diYc0xA_ANYC94lB",
};

export const VAPID_PUBLIC_KEY = "BJoGf3i9uQROM2JIGvF4nzjMszi944yjyRZhkoQcXOqG0lGQLwcZyJRrT9LlkcqRdq_C7uDDL892fkzZclkve0A";

const WHATSAPP_NUMBER = "5511916492207";
export const CONTACT = {
  whatsappNumber: WHATSAPP_NUMBER,
  whatsappDisplay: "(11) 91649-2207",
  whatsappGroup: "https://chat.whatsapp.com/IwlbvePi2xC8Jfy13D0brb",
  whatsappChannel: "https://whatsapp.com/channel/0029VbDvuk51HsptHs3Cgv0S",
  email: "contato@centraldenoticias24h.com",
  waLink: (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`,
};

export const SOCIAL: { key: string; label: string; url: string }[] = [
  { key: "instagram", label: "Instagram", url: "https://www.instagram.com/centraldenoticias24h/" },
  { key: "facebook", label: "Facebook", url: "" },
  { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@centraldenoticias24h" },
  { key: "youtube", label: "YouTube", url: "https://www.youtube.com/@CentralDeNoticias24h" },
  { key: "kwai", label: "Kwai", url: "" },
  { key: "whatsapp", label: "Canal no WhatsApp", url: "https://whatsapp.com/channel/0029VbDvuk51HsptHs3Cgv0S" },
];

export type CityKey = "embu" | "taboao" | "itapecerica" | "zona-sul" | "regiao";
export const CITIES: Record<CityKey, { name: string; short: string; path: string; color: string; about: string }> = {
  embu: {
    name: "Embu das Artes",
    short: "Embu",
    path: "/embu-das-artes/",
    color: "#E2620F",
    about: "Últimas notícias de Embu das Artes: segurança, trânsito, prefeitura, eventos e serviços.",
  },
  taboao: {
    name: "Taboão da Serra",
    short: "Taboão",
    path: "/taboao-da-serra/",
    color: "#1F5FD1",
    about: "Últimas notícias de Taboão da Serra: segurança, trânsito, obras do metrô, prefeitura e serviços.",
  },
  itapecerica: {
    name: "Itapecerica da Serra",
    short: "Itapecerica",
    path: "/itapecerica-da-serra/",
    color: "#14855A",
    about: "Últimas notícias de Itapecerica da Serra: segurança, saúde, educação, prefeitura e serviços.",
  },
  "zona-sul": {
    name: "Zona Sul de SP",
    short: "Zona Sul",
    path: "/zona-sul/",
    color: "#7A3DC8",
    about: "Notícias da Zona Sul de São Paulo: Capão Redondo, Campo Limpo, M'Boi Mirim, Jardim Ângela e região.",
  },
  regiao: {
    name: "Região",
    short: "Região",
    path: "/regiao/",
    color: "#566070",
    about: "Notícias de Cotia, Osasco, São Paulo e cidades vizinhas que afetam a nossa região.",
  },
};
export const CITY_BY_PATH = Object.fromEntries(
  Object.entries(CITIES).map(([k, v]) => [v.path.replace(/\//g, ""), k as CityKey]),
) as Record<string, CityKey>;

export const CATEGORIES: Record<string, string> = {
  policia: "Polícia",
  transito: "Trânsito",
  politica: "Política",
  cidade: "Cidade",
  saude: "Saúde",
  educacao: "Educação",
  eventos: "Eventos e Cultura",
  esportes: "Esportes",
  empregos: "Empregos",
  gastronomia: "Gastronomia",
  noticias: "Notícias",
};

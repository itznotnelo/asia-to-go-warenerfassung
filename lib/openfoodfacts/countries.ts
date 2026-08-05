/**
 * OFF-Ländertags → ISO-2. Bewusst keine vollständige Liste — nur Länder, die
 * für ein Asia-Sortiment in der Schweiz realistisch vorkommen. Unbekannte
 * Tags bleiben unübersetzt liegen, statt geraten zu werden.
 */
const TAG_TO_ISO2: Record<string, string> = {
  china: "CN",
  thailand: "TH",
  "south-korea": "KR",
  "korea-south": "KR",
  japan: "JP",
  vietnam: "VN",
  indonesia: "ID",
  malaysia: "MY",
  philippines: "PH",
  india: "IN",
  taiwan: "TW",
  "hong-kong": "HK",
  singapore: "SG",
  switzerland: "CH",
  germany: "DE",
  austria: "AT",
  france: "FR",
  italy: "IT",
  "united-kingdom": "GB",
  "united-states": "US",
};

/**
 * `countries_tags` ist das Verkaufsland, nicht zwingend das Herkunftsland —
 * deshalb nur als unverbindlicher Vorschlag mappen, siehe SKILL.md.
 */
export function suggestOriginCountry(countriesTags: string[] | undefined): string | undefined {
  const first = countriesTags?.[0];
  if (!first) return undefined;
  const slug = first.includes(":") ? first.slice(first.indexOf(":") + 1) : first;
  return TAG_TO_ISO2[slug.toLowerCase()];
}

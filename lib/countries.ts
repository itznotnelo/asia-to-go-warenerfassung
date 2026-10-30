// Herkunftsland dropdown. Value = ISO 3166-1 alpha-2 (what Product.originCountry
// stores), label = German name in Swiss spelling. Copy from design's #3065 sheet.

export interface CountryOption {
  code: string;
  label: string;
}

/** Group "Häufig": Asian origins first, then Switzerland and the EU countries the wholesalers ship from. */
export const COMMON_ORIGINS: readonly CountryOption[] = [
  { code: "TH", label: "Thailand" },
  { code: "CN", label: "China" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "Südkorea" },
  { code: "VN", label: "Vietnam" },
  { code: "IN", label: "Indien" },
  { code: "LK", label: "Sri Lanka" },
  { code: "ID", label: "Indonesien" },
  { code: "MY", label: "Malaysia" },
  { code: "PH", label: "Philippinen" },
  { code: "TW", label: "Taiwan" },
  { code: "HK", label: "Hongkong" },
  { code: "SG", label: "Singapur" },
  { code: "PK", label: "Pakistan" },
  { code: "BD", label: "Bangladesch" },
  { code: "KH", label: "Kambodscha" },
  { code: "MM", label: "Myanmar" },
  { code: "NP", label: "Nepal" },
  { code: "CH", label: "Schweiz" },
  { code: "DE", label: "Deutschland" },
  { code: "NL", label: "Niederlande" },
  { code: "IT", label: "Italien" },
  { code: "FR", label: "Frankreich" },
  { code: "AT", label: "Österreich" },
  { code: "PL", label: "Polen" },
];

// Every ISO 3166-1 alpha-2 code (249).
export const ISO_COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU " +
  "ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ " +
  "LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA " +
  "RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ " +
  "VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

// CLDR's names that are long or official; the shop says it shorter.
const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  HK: "Hongkong",
  MO: "Macau",
  US: "USA",
  GB: "Grossbritannien",
};

const ESZETT = String.fromCharCode(223);

const COMMON_CODES = new Set(COMMON_ORIGINS.map((c) => c.code));

export function countryLabel(code: string, displayNames?: Intl.DisplayNames): string {
  const override = LABEL_OVERRIDES[code] ?? COMMON_ORIGINS.find((c) => c.code === code)?.label;
  if (override) return override;
  const names = displayNames ?? new Intl.DisplayNames(["de-CH"], { type: "region" });
  // Swiss spelling, in case an ICU build returns an Eszett.
  return (names.of(code) ?? code).replaceAll(ESZETT, "ss");
}

/** Group "Alle Länder": every code not in COMMON_ORIGINS, A to Z by German label. */
export function allOtherCountries(): CountryOption[] {
  const names = new Intl.DisplayNames(["de-CH"], { type: "region" });
  return ISO_COUNTRY_CODES.filter((code) => !COMMON_CODES.has(code))
    .map((code) => ({ code, label: countryLabel(code, names) }))
    .sort((a, b) => a.label.localeCompare(b.label, "de-CH"));
}

export function isKnownCountryCode(code: string): boolean {
  return ISO_COUNTRY_CODES.includes(code);
}

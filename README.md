# Asia Shop Schaffhausen

Warenerfassung für einen Asia-Lebensmittelladen in Schaffhausen. Details zu
Stack, harten Regeln und Konventionen stehen in [`CLAUDE.md`](./CLAUDE.md).

## Setup (5 Minuten)

Voraussetzungen: Node 20+, pnpm, Docker Desktop.

```bash
pnpm install

# Postgres starten
docker compose up -d

# .env anlegen (Default passt zu docker-compose.yml)
cp .env.example .env

# Schema anwenden + Beispieldaten einspielen
npx prisma migrate dev

# Entwicklungsserver starten
pnpm dev
```

Öffne [http://localhost:3000](http://localhost:3000).

`prisma migrate dev` führt `prisma/seed.ts` automatisch nach der ersten
Migration aus (Kategorie-Baum + ein paar Beispielprodukte). Erneut seeden,
ohne zu migrieren:

```bash
pnpm db:seed
```

## Weitere Befehle

```bash
pnpm test          # Vitest einmalig
pnpm test:watch    # Vitest im Watch-Modus
pnpm lint          # ESLint
npx prisma studio  # DB im Browser inspizieren
```

## Struktur

Siehe [`CLAUDE.md`](./CLAUDE.md#verzeichnisse) für das Verzeichnis-Layout und
die harten Regeln (Geld als Rappen-`Int`, Grundpreis nur berechnet nie
gespeichert, `dataComplete`-Flag, etc.).

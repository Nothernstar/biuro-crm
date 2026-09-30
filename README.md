# BRCRM — CRM sprzedaży dla biura rachunkowego

Aplikacja CRM z trwałą bazą PostgreSQL (Neon) i statystykami liczonymi z realnych danych.

## Architektura
- frontend: HTML/CSS/JS
- backend: Vercel Functions w katalogu `api/`
- baza: Neon PostgreSQL
- połączenie: `DATABASE_URL`
- tabele tworzą się automatycznie przy pierwszym wywołaniu API

## Dane
Aplikacja nie używa już danych demo ani localStorage jako źródła rekordów.

Leady powstają dopiero po dodaniu ich przez formularz. Moduły CRM/fakturowe zapisują swoje rekordy do tabeli `module_items`.

## Statystyki
Widok **Statystyki** pokazuje:
- liczbę leadów
- aktywne leady
- wygrane i przegrane
- MRR wygrany
- MRR pipeline
- konwersję lead → klient
- rozkład po etapach
- wyniki według źródła
- filtrowanie po opiekunie

## Konfiguracja Vercel + Neon
1. Podłącz Neon Postgres do projektu Vercel.
2. Upewnij się, że projekt ma zmienną środowiskową `DATABASE_URL`.
3. Wykonaj redeploy aplikacji.
4. Otwórz CRM i dodaj pierwszy lead — schema utworzy się automatycznie.

W repo znajduje się `.env.example` z nazwą wymaganej zmiennej.

## API
- `GET/POST/PATCH/DELETE /api/leads`
- `GET/POST/DELETE /api/modules`
- `GET /api/stats`
- `GET /api/stats?owner=<nazwa>`

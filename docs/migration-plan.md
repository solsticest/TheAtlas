# Migration plan — Legacy v4.1 → React/TypeScript/Node/Prisma

Рабочая ветка: `feat/react-atlas-migration`.

## Принцип

Не переписывать Atlas «с нуля» одним коммитом. Новый stack строится рядом с legacy. На каждом этапе есть проверяемый выход и возможность отката.

## Этап 0 — Baseline и страховка

Состояние: начат.

- Зафиксировать аудит legacy.
- Поднять CI, который запускает существующие regression tests.
- Не менять `data/atlas.json` и assets.
- Зафиксировать counts, IDs, parent relations и asset names.

Готово, когда legacy tests зелёные в GitHub Actions.

## Этап 1 — Скелет нового stack

Создать npm workspace/monorepo:

- `apps/web` — React + TypeScript strict + Vite + MUI + React Router.
- `apps/api` — Express + TypeScript.
- `packages/shared` — Zod schemas + shared API types.
- Prisma + SQLite.
- ESLint + Prettier + Vitest.
- `GET /api/health`.

Legacy-код остаётся на месте.

Target developer UX после этого этапа:

```powershell
npm install
npm run dev
npm run typecheck
npm test
```

## Этап 2 — Legacy schema + dry-run importer

До записи в БД создать строгий parser v4.

Dry-run обязан вывести:
- counts;
- все IDs;
- parent relations;
- список map/media assets;
- dimensions;
- неизвестные поля;
- битые ссылки;
- дубли ID;
- циклы;
- отсутствующие файлы.

Никакой модификации legacy JSON в dry-run.

## Этап 3 — Prisma schema + транзакционный import/export

Создать модели World/MapLayer/MarkerType/Location/MediaAsset.

Требования:
- сохранять исходные ID;
- сохранять asset filename;
- сохранять parent-relative bounds без переинтерпретации;
- хранить неизвестные legacy fields;
- import idempotent;
- transaction rollback при потере данных;
- export всего legacy-compatible project;
- round-trip comparison.

Только после успешного round-trip считать данные «пересаженными».

## Этап 4 — Read-only API и assets

Публичные GET endpoints:
- worlds;
- marker types;
- layers;
- locations;
- search;
- articles;
- assets.

Сервер безопасно раздаёт изображения и не позволяет path traversal.

На этом этапе новый frontend ещё ничего не редактирует.

## Этап 5 — React renderer с визуальным паритетом

Перенести публичный просмотр:

- `L.CRS.Simple`;
- базовая карта;
- nested layers;
- lazy asset loading;
- `showAtZoom`/`fadeRange`;
- discrete `minZoom`;
- visual rotation;
- world switch;
- global search;
- location card/article;
- sidebar;
- ruler.

`atlas-math.js` сначала портируется в TypeScript с теми же fixtures, затем renderer использует новую реализацию.

## Этап 6 — Admin CRUD с паритетом редактора

Перенести:
- world editing;
- marker types;
- markers;
- map layers;
- image upload;
- drag/resize;
- two-point alignment;
- article editor;
- media attachments;
- undo/redo contract;
- delete confirmations.

Координаты выбираются на карте, а не только ручным вводом.

## Этап 7 — Безопасность, persistence, backup/restore

Один admin:
- password hash only on server;
- HttpOnly session cookie;
- CSRF protection;
- rate limit login;
- Zod validation;
- upload validation.

Добавить:
- DB backup;
- assets backup;
- full export;
- restore test;
- restart persistence test.

## Этап 8 — Cutover и инструкция запуска

Только после parity:
- новый stack становится основной точкой входа;
- legacy остаётся в `legacy/` или в зафиксированном tag/branch;
- README получает инструкцию для новичка;
- добавляется production build/deploy guide;
- выполняется ручной browser checklist.

## Порядок приоритетов

P0:
1. Ноль потерь данных.
2. Ноль изменений геометрической семантики.
3. Читающий новый frontend.
4. Безопасный admin CRUD.
5. Backup/export/restore.
6. Понятный локальный запуск.

P1 после стабильного cutover:
- улучшения UX;
- дополнительные редакторские удобства;
- более сложный WYSIWYG;
- интеграционный API для Chronicle.

## Как пользователь будет запускать проект

Пока новый stack ещё не создан, текущая v4.1 запускается как раньше: открыть `index.html` в Chromium-браузере и выбрать корневую папку проекта.

Legacy tests на Windows PowerShell:

```powershell
node tests/regression.cjs
node tests/main-folder.cjs
```

Если Python доступен только через launcher `py`:

```powershell
$env:ATLAS_TEST_PYTHON="py"
node tests/regression.cjs
```

После Этапа 1 команды `npm install` / `npm run dev` будут реальными и будут описаны в корневом README. До создания этих scripts их не следует выдавать за уже работающие.

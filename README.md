# The Atlas — React, TypeScript, SQLite

Миграционная ветка: **feat/react-atlas-migration**. Исходная версия v4.1 полностью сохранена: index.html, js/, css/, data/atlas.json и maps/ не удаляются. Работа с базой SQLite не изменяет оригинальный JSON.

## Windows / диск D:

Требуется Windows, Git, Node.js версии 22 или новее. VS Code необязателен; Python нужен лишь для некоторых legacy-тестов.

Обновить уже склонированный проект из PowerShell:

~~~powershell
cd D:\Projects\TheAtlas
git switch feat/react-atlas-migration
git pull --ff-only
npm.cmd install
npm.cmd run db:setup
npm.cmd run import:atlas -- --verify
~~~

Если база ещё **не** импортировалась, вместо последней команды:

~~~powershell
npm.cmd run import:atlas -- --dry-run
New-Item -ItemType Directory -Force -Path "D:\Projects\TheAtlas-Backups"
npm.cmd run import:atlas -- --apply --backup-dir "D:\Projects\TheAtlas-Backups"
npm.cmd run import:atlas -- --verify
~~~

Повторять --apply после успешного импорта НЕ нужно. Позднейшие правки в SQLite не синхронизируются обратно в data/atlas.json.

Настроить пароль администратора (один раз, минимум 12 символов):

~~~powershell
npm.cmd run admin:setup
~~~

Скрипт скрывает ввод пароля, пишет только bcrypt-хеш и секрет сессии в .env. Файл .env исключён из Git. Никому его не пересылай.

Запустить:

~~~powershell
npm.cmd run dev
~~~

Открыть http://localhost:5173 (публичная карта), http://localhost:5173/admin (редактор), http://localhost:3001/api/health (проверка API). Остановить — Ctrl+C.

## Контент

Публичная карта доступна без входа. Таймлайны, эпохи и события создаются в /admin и видны посетителю только после публикации. События могут ссылаться на существующие локации, иметь собственные X/Y либо вообще не иметь геопозиции. В последнем случае они появляются только в списке. Даты подписываются текстом; земной календарь не навязывается.

## Тестирование

~~~powershell
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:migration
npm.cmd run test:database
npm.cmd run test:geometry
npm.cmd run test:api
npm.cmd run test:admin
npm.cmd run build
~~~

Для оригинального кода — npm.cmd run test:legacy (требует Python). В GitHub Actions проверки проходят автоматически. Тесты не заменяют ручное сравнение Leaflet в браузере.

## Бэкап и восстановление

~~~powershell
npm.cmd run backup:atlas
~~~

Полный SQLite snapshot и копия всех assets с manifest/SHA-256 создаются в storage/backups/atlas-snapshot-...

Проверка произвольной сохранённой копии:

~~~powershell
npm.cmd run backup:atlas -- --verify --from "D:\Projects\TheAtlas\storage\backups\atlas-snapshot-ИМЯ"
~~~

Безопасное пробное восстановление только в **новую, несуществующую папку**, не поверх рабочей БД:

~~~powershell
npm.cmd run backup:atlas -- --restore --from "D:\Projects\TheAtlas\storage\backups\atlas-snapshot-ИМЯ" --into "D:\Projects\Atlas-Restore-Test"
~~~

Отдельно копируй внешнюю TheAtlas-Backups и storage/backups на другой диск. Git не содержит пользовательскую SQLite и приватные медиа.

## Архитектура и ограничения

Подробности: docs/admin-guide.md, docs/architecture.md, docs/features.md, docs/migration-report.md, docs/viewer-runbook.md.

Для размещения в интернете нужны HTTPS, правильно настроенные cookie и **постоянный диск**. Serverless с эфемерной ФС не подходит для SQLite и файлов без дополнительной архитектуры; для него потребуется PostgreSQL и объектное хранилище.

В редакторе карт теперь есть перетаскивание/изменение размера и совмещение по двум точкам. Отмена/повтор работают для **активной несохранённой формы** (до 60 снимков), но не заменяют глобальную историю оригинального редактора. Не сливай миграционную ветку в main и не удаляй оригинальные данные до ручной приёмки.


## Production build (только после настройки HTTPS)

~~~powershell
cd D:\Projects\TheAtlas
npm.cmd run build
$env:NODE_ENV="production"
$env:HOST="127.0.0.1"
npm.cmd start
~~~

Express отдаёт собранный React и /admin по http://localhost:3001, а также все /api маршруты. Для публичного домена HTTPS terminates в reverse proxy; нельзя просто открыть порт без HTTPS и ожидать безопасной admin-сессии.

## Локальный релиз-кандидат RC1 — 2026-11-06

Основные пользовательские сценарии проверены на Windows: по ответам тестировщика 38 проверок успешны, один длительный нагрузочный тест пропущен. Локальное использование допускается с сохранением legacy и резервных копий. **В main не сливать**, полноту parity и публичную production-готовность не заявлять. См. `docs/acceptance-windows-2026-11-06.md`. Частые изменения создают новые snapshots, следи за объёмом `storage/backups`.

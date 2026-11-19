# Этап 3. Перенос Atlas v4 в SQLite — инструкция для Windows (диск D:)

> Выполняй эти действия **только после зелёного теста database в GitHub Actions**.
> При несовпадении контрольных сумм, количестве объектов или ошибке importer — остановись, не меняй исходный `atlas.json` вручную.

## 1. Что переносим

Таблицы `World`, `MarkerType`, `MapLayer`, `Location`, `MediaAsset` и служебную запись `AtlasDocument`. Каждая сущность содержит неизменённый исходный JSON (`raw`), а также отдельные типизированные поля для будущих запросов.

Вложенность `parentId` остаётся прежней; `bounds` — в координатах родительской карты. `rotation`, точные координаты, ссылки и теги не пересчитываются.

Изображения копируются **без сжатия и переименования** в `storage/assets/maps` (и `storage/assets/media`, если они есть). Исходные `maps/` и `media/` не редактируются.

Для резервной копии требуем отдельную папку на D: **вне репозитория**. Импортёр сам создаст внутри неё уникальный каталог, включающий `data/`, `maps/`, `media/` и контрольный manifest.

## 2. Подготовка

Останови работающий сервер `npm.cmd run dev`, нажав **Ctrl+C** в его PowerShell.

Открой другой PowerShell:

```powershell
cd D:\Projects\TheAtlas
git switch feat/react-atlas-migration
git pull --ff-only
npm.cmd install
```

Затем проверь, что ты именно на нужной ветке:

```powershell
git branch --show-current
```

Ожидается `feat/react-atlas-migration`.

## 3. Создать SQLite-таблицы и Prisma Client

```powershell
npm.cmd run db:setup
```

SQLite-файл создаётся в `D:\Projects\TheAtlas\storage\atlas.db`. Папка `storage/` исключена из Git. Эта команда **не импортирует** старые данные и не меняет `data/atlas.json`.

## 4. Проверить перед импортом

```powershell
npm.cmd run import:atlas -- --dry-run
```

Ожидается:

- 2 мира;
- 7 типов маркеров;
- 3 слоя;
- 5 локаций;
- 5 изображений;
- 1 статья;
- статус `dry-run`.

## 5. Настоящий импорт с backup

Убедись, что все изменения оригинального Atlas сохранены на диск, а не только в открытом браузере.

Создай папку резервных копий вне проекта:

```powershell
New-Item -ItemType Directory -Force D:\Projects\TheAtlas-Backups
```

Запусти:

```powershell
npm.cmd run import:atlas -- --apply --backup-dir "D:\Projects\TheAtlas-Backups"
```

Импортёр сначала делает независимую копию оригинальных папок `data`, `maps`, `media`, сверяет SHA-256 с исходными файлами и только после этого записывает данные в SQLite.

Успех:

```json
{
  "status": "imported",
  "backup": "D:\\Projects\\TheAtlas-Backups\\atlas-v4-...",
  "count": 5,
  "hash": "3a20704af9d3d5c22b7fcbb9f6a93bb85a83c470bd5799071fe139ae8d48f7de"
}
```

Если команда запускается второй раз на том же JSON, ожидается `already-imported`: данные не дублируются. Если оригинальный JSON отличается от уже импортированного, импорт прекращается без перезаписи.

## 6. Проверить round-trip

```powershell
npm.cmd run import:atlas -- --verify
npm.cmd run export:atlas -- --compare "D:\Projects\TheAtlas\data\atlas.json" --output "D:\Projects\TheAtlas-Backups\atlas-export.json"
```

Экспорт создаётся с защитой от перезаписи существующего файла. При совпадении данных и изображений выводится `Round-trip export OK`.

## 7. Изолированный тест самого импортёра (не использует рабочую SQLite-базу)

```powershell
npm.cmd run test:database
```

Тест создаёт временную базу в `storage/test-import-...`, временный каталог assets и отдельную backup-папку. По завершении удаляет именно тестовые файлы, не трогая `storage/atlas.db`.

## Что пока НЕ готово

- React-карта ещё не читает SQLite.
- Нет публичного API чтения миров и слоёв.
- Нет админки и авторизации.
- Настоящий импорт — однократная безопасная операция, **не синхронизация** изменений между старым и новым редакторами.
- После импорта продолжать менять старый Atlas можно, но эти новые правки не появятся автоматически в SQLite. До подключения нового редактора не веди две расходящиеся активные версии данных.

Следующий этап — read-only API и настоящая React-карта.

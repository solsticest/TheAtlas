import path from 'node:path';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { searchQuerySchema } from '@atlas/shared';
import { registerAuth } from './auth.js';
import { registerTimelines } from './timelines.js';
import { registerAtlasAdmin } from './admin-atlas.js';
import { registerUploads } from './uploads.js';
import { config as loadEnv } from 'dotenv';
import { atlasEnvFile, atlasAssetsDir, atlasWebDist } from './paths.js';

loadEnv({ path: atlasEnvFile });
process.env.DATABASE_URL ||= 'file:../../../storage/atlas.db';

const validFilename = (name: string) =>
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) && name !== '.' && !name.includes('..');
const safeId = (id: string) => id.length > 0 && id.length <= 255;

type AtlasDb = PrismaClient;
type ErrorBody = { error: { code: string; message: string } };
const issue = (code: string, message: string): ErrorBody => ({ error: { code, message } });

function textOf(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot);/gi, ' ').replace(/\s+/g, ' ');
}

export function createApp(db: AtlasDb = new PrismaClient()): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  registerAuth(app,db);
  registerTimelines(app,db);
  registerAtlasAdmin(app,db);
  registerUploads(app,db);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'the-atlas-api' });
  });

  app.get('/api/types', async (_req, res, next) => {
    try {
      const rows = await db.markerType.findMany({ orderBy: { sortOrder: 'asc' } });
      res.json(rows.map(row => ({
        ...JSON.parse(row.raw) as Record<string, unknown>,
        id: row.id, name: row.name, symbol: row.symbol,
        color: row.color, iconSvg: row.iconSvg,
      })));
    } catch (error) { next(error); }
  });

  app.get('/api/worlds', async (_req, res, next) => {
    try {
      const rows = await db.world.findMany({ orderBy: { sortOrder: 'asc' } });
      res.json(rows.map(row => {
        const raw = JSON.parse(row.raw) as Record<string, unknown>;
        return { id: row.id, name: row.name, image: row.image,
          width: raw.width ?? row.width, height: raw.height ?? row.height,
          kmPerPixel: raw.kmPerPixel ?? row.kmPerPixel };
      }));
    } catch (error) { next(error); }
  });

  app.get('/api/worlds/:id', async (req, res, next) => {
    if (!safeId(req.params.id)) { res.status(400).json(issue('BAD_ID', 'Неверный ID мира')); return; }
    try {
      const row = await db.world.findUnique({ where: { id: req.params.id } });
      if (!row) { res.status(404).json(issue('NOT_FOUND', 'Мир не найден')); return; }
      const raw = JSON.parse(row.raw) as Record<string, unknown>;
      res.json({ id: row.id, name: row.name, image: row.image,
        width: raw.width ?? row.width, height: raw.height ?? row.height,
        kmPerPixel: raw.kmPerPixel ?? row.kmPerPixel });
    } catch (error) { next(error); }
  });

  app.get('/api/worlds/:id/layers', async (req, res, next) => {
    if (!safeId(req.params.id)) { res.status(400).json(issue('BAD_ID', 'Неверный ID мира')); return; }
    try {
      const rows = await db.mapLayer.findMany({ where: { worldId: req.params.id }, orderBy: { sortOrder: 'asc' } });
      res.json(rows.map(row => {
        const raw = JSON.parse(row.raw) as Record<string, unknown>;
        return { ...raw, worldId: row.worldId, parentId: row.parentId, image: row.image,
          rotation: raw.rotation ?? row.rotation, showAtZoom: raw.showAtZoom ?? row.showAtZoom,
          fadeRange: raw.fadeRange ?? row.fadeRange, enabled: raw.enabled ?? row.enabled };
      }));
    } catch (error) { next(error); }
  });

  app.get('/api/worlds/:id/locations', async (req, res, next) => {
    if (!safeId(req.params.id)) { res.status(400).json(issue('BAD_ID', 'Неверный ID мира')); return; }
    try {
      const rows = await db.location.findMany({ where: { worldId: req.params.id }, orderBy: { sortOrder: 'asc' } });
      res.json(rows.map(row => {
        const raw = JSON.parse(row.raw) as Record<string, unknown>;
        return { ...raw, worldId: row.worldId, color: row.color,
          minZoom: raw.minZoom ?? row.minZoom, description: row.description,
          article: row.article, tags: JSON.parse(row.tags) as string[] };
      }));
    } catch (error) { next(error); }
  });

  app.get('/api/locations/:id', async (req, res, next) => {
    if (!safeId(req.params.id)) { res.status(400).json(issue('BAD_ID', 'Неверный ID локации')); return; }
    try {
      const row = await db.location.findUnique({ where: { id: req.params.id } });
      if (!row) { res.status(404).json(issue('NOT_FOUND', 'Локация не найдена')); return; }
      res.json({ ...JSON.parse(row.raw) as Record<string, unknown>,
        worldId: row.worldId, article: row.article, description: row.description, tags: JSON.parse(row.tags) as string[] });
    } catch (error) { next(error); }
  });

  app.get('/api/search', async (req, res, next) => {
    const parsed = searchQuerySchema.safeParse({ q: req.query.q });
    if (!parsed.success) { res.status(400).json(issue('BAD_QUERY', 'Поисковый запрос слишком длинный')); return; }
    const q = parsed.data.q.toLocaleLowerCase('ru');
    if (!q) { res.json([]); return; }
    try {
      const [worlds, layers, locations] = await Promise.all([
        db.world.findMany({ orderBy: { sortOrder: 'asc' } }),
        db.mapLayer.findMany({ orderBy: [{ worldId: 'asc' }, { sortOrder: 'asc' }] }),
        db.location.findMany({ orderBy: [{ worldId: 'asc' }, { sortOrder: 'asc' }] }),
      ]);
      const names = new Map(worlds.map(w => [w.id, w.name]));
      const results: { kind: 'world' | 'layer' | 'location'; id: string; worldId: string; title: string; subtitle: string }[] = [];
      for (const w of worlds) {
        if (w.name.toLocaleLowerCase('ru').includes(q)) results.push({
          kind: 'world', id: w.id, worldId: w.id, title: w.name, subtitle: 'Мир'
        });
      }
      for (const l of layers) {
        if (l.name.toLocaleLowerCase('ru').includes(q)) results.push({
          kind: 'layer', id: l.id, worldId: l.worldId, title: l.name, subtitle: names.get(l.worldId) ?? ''
        });
      }
      for (const loc of locations) {
        const { name, description, article, tags } = loc;
        const haystack = [name, description, textOf(article ?? ''), ...JSON.parse(tags) as string[]].join(' ').toLocaleLowerCase('ru');
        if (haystack.includes(q)) results.push({
          kind: 'location', id: loc.id, worldId: loc.worldId, title: loc.name,
          subtitle: names.get(loc.worldId) ?? ''
        });
      }
      res.json(results.slice(0, 100));
    } catch (error) { next(error); }
  });

  app.get('/api/assets/:kind/:filename', async (req, res, next) => {
    const { kind, filename } = req.params;
    if (!(['maps', 'media', 'icons'].includes(kind)) || !validFilename(filename)) {
      res.status(400).json(issue('BAD_ASSET_PATH', 'Недопустимый путь файла')); return;
    }
    const key = kind + '/' + filename;
    try {
      const asset = await db.mediaAsset.findUnique({ where: { path: key } });
      if (!asset) { res.status(404).json(issue('NOT_FOUND', 'Файл отсутствует в атласе')); return; }
      const dir = await realpath(atlasAssetsDir());
      const file = await realpath(path.join(dir, asset.storedPath));
      if (!file.startsWith(dir + path.sep)) { res.status(403).json(issue('BAD_ASSET_PATH', 'Выход за пределы хранилища')); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.sendFile(file, error => { if (error && !res.headersSent) next(error); });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') { res.status(404).json(issue('NOT_FOUND', 'Файл не найден на диске')); return; }
      next(error);
    }
  });

  app.use('/api', (_req, res) => { res.status(404).json(issue('NOT_FOUND', 'Неизвестный API-маршрут')); });
  if(process.env.NODE_ENV==='production'){
    const webDist=atlasWebDist;
    const index=path.join(webDist,'index.html');
    if(existsSync(index)){
      app.use(express.static(webDist,{index:'index.html',maxAge:'1h',setHeaders:(res)=>{
        res.setHeader('X-Content-Type-Options','nosniff');
      }}));
      // Browser history routes /admin and /world/* must serve the React shell.
      app.use((req,res,next)=>{
        if(req.method!=='GET'&&req.method!=='HEAD'){next();return;}
        res.sendFile(index);
      });
    }
  }
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    console.error('Atlas API:', error);
    if (res.headersSent) return;
    const prismaCode = (error as { code?: string })?.code;
    if ((error as {type?:string})?.type==='entity.too.large'){
      res.status(413).json(issue('TOO_LARGE','Файл слишком большой'));return;
    }
    if (prismaCode==='P2002') {res.status(409).json(issue('CONFLICT','Конфликт уникального идентификатора или порядка'));return;}
    if (prismaCode==='P2003') {res.status(409).json(issue('IN_USE','Нельзя удалить объект с зависимыми данными'));return;}
    if (prismaCode==='P2025') {res.status(404).json(issue('NOT_FOUND','Объект не найден'));return;}
    if (['P1001', 'P1003', 'P2021'].includes(prismaCode ?? '')) {
      res.status(503).json(issue('DATABASE_NOT_READY', 'База не настроена. Выполните db:setup и импорт Atlas.'));
      return;
    }
    res.status(500).json(issue('SERVER_ERROR', 'Ошибка чтения данных Atlas'));
  };
  app.use(errors);
  return app;
}

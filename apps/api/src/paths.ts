import path from 'node:path';
import { fileURLToPath } from 'node:url';

// npm run dev -w @atlas/api starts with process.cwd() === apps/api.
// Resolve relative to the module location instead: works for src/ and dist/
// and when the user starts the server from any directory on Windows.
export const atlasRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const atlasEnvFile = path.join(atlasRoot, '.env');
export const atlasAssetsDir = () => path.resolve(
  process.env.ATLAS_ASSETS_DIR || path.join(atlasRoot, 'storage', 'assets'),
);
export const atlasBackupDir = () => path.resolve(
  process.env.ATLAS_BACKUP_DIR || path.join(atlasRoot, 'storage', 'backups'),
);
export const atlasWebDist = path.join(atlasRoot, 'apps', 'web', 'dist');

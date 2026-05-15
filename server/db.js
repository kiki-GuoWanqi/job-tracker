import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'jobtracker.db');
const schemaPath = path.join(__dirname, 'schema.sql');

let dbInstance = null;

export function initDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  dbInstance = new DatabaseSync(dbPath);
  dbInstance.exec('PRAGMA journal_mode = WAL');
  dbInstance.exec('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  dbInstance.exec(schema);
  runMigrations(dbInstance);
  return dbInstance;
}

// Idempotent ALTER TABLE for fields added after initial schema.
// schema.sql holds the latest shape for fresh installs; this catches existing DBs.
function runMigrations(db) {
  const cols = new Set(
    db.prepare("PRAGMA table_info(applications)").all().map(c => c.name)
  );
  const additions = [
    ['greeting_message', 'TEXT'],
    ['greeting_message_at', 'TEXT'],
    ['cover_letter', 'TEXT'],
    ['cover_letter_at', 'TEXT']
  ];
  for (const [col, type] of additions) {
    if (!cols.has(col)) {
      db.exec(`ALTER TABLE applications ADD COLUMN ${col} ${type}`);
    }
  }
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

import fs from 'fs';
import path from 'path';

const supabaseDir = path.join(process.cwd(), 'supabase');
const migrationsDir = path.join(supabaseDir, 'migrations');
const backupDir = path.join(supabaseDir, 'backup_migrations');

// Create backup directory
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
}

// Move all files in migrations to backup
const files = fs.readdirSync(migrationsDir);
for (const f of files) {
    fs.renameSync(path.join(migrationsDir, f), path.join(backupDir, f));
}
console.log('Moved all migrations to backup');

// Read schema.sql and schema_perfect.sql to determine the best single migration
const schemaPath = path.join(supabaseDir, 'schema.sql');
const perfectPath = path.join(supabaseDir, 'schema_perfect.sql');

let useSchema = '';
if (fs.existsSync(perfectPath)) {
    useSchema = perfectPath;
} else if (fs.existsSync(schemaPath)) {
    useSchema = schemaPath;
}

if (useSchema) {
    const content = fs.readFileSync(useSchema, 'utf8');
    const targetMigration = path.join(migrationsDir, '20261023000000_consolidated_schema.sql');
    fs.writeFileSync(targetMigration, content);
    console.log('Created consolidated migration from ' + path.basename(useSchema));
} else {
    console.log('No consolidated schema found');
}

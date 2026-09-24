import fs from 'fs';
import path from 'path';

const supabaseDir = path.join(process.cwd(), 'supabase');
const migrationsDir = path.join(supabaseDir, 'migrations');

// Remove all files in migrations currently to ensure clean slate
const currentFiles = fs.readdirSync(migrationsDir);
for (const f of currentFiles) {
    fs.unlinkSync(path.join(migrationsDir, f));
}

// Restore natively timestamped ones from backup
const backupDir = path.join(supabaseDir, 'backup_migrations');
if (fs.existsSync(backupDir)) {
    const backupFiles = fs.readdirSync(backupDir);
    for (const f of backupFiles) {
        if (f.startsWith('2026')) {
            fs.copyFileSync(path.join(backupDir, f), path.join(migrationsDir, f));
        }
    }
}

// Write the perfect schema as the FIRST migration (01 Jan 2026) so it runs before 22 Apr 2026
const schemaContent = fs.readFileSync(path.join(supabaseDir, 'schema_perfect.sql'), 'utf8');
fs.writeFileSync(path.join(migrationsDir, '20260101000000_init_schema.sql'), schemaContent);

console.log('Migration folder prepared. Ready for db push --include-all.');

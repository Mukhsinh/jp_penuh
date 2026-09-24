import fs from 'fs';
import path from 'path';

const supabaseDir = path.join(process.cwd(), 'supabase');
const migrationsDir = path.join(supabaseDir, 'migrations');
const backupDir = path.join(supabaseDir, 'backup_migrations');

// Move natively timestamped files (starting with 2026) back
const files = fs.readdirSync(backupDir);
for (const f of files) {
    if (f.startsWith('2026')) {
        fs.copyFileSync(path.join(backupDir, f), path.join(migrationsDir, f));
        console.log(`Restored ${f}`);
    }
}

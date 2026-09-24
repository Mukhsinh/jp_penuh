import fs from 'fs';
import path from 'path';

const supabaseDir = path.join(process.cwd(), 'supabase');
const initFile = path.join(supabaseDir, 'migrations', '20260101000000_init_schema.sql');

let content = fs.readFileSync(initFile, 'utf8');

// Replace all occurrences
content = content.replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
// Remove extension creation just to be clean
content = content.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '');

fs.writeFileSync(initFile, content);
console.log('Successfully swapped UUID generators.');

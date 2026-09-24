import fs from 'fs';
import path from 'path';

const supabaseDir = path.join(process.cwd(), 'supabase');
const initFile = path.join(supabaseDir, 'migrations', '20260101000000_init_schema.sql');

const content = fs.readFileSync(initFile, 'utf8');
if (!content.includes('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')) {
    fs.writeFileSync(initFile, 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n' + content);
    console.log('Added uuid-ossp extension to migration');
}

import fs from 'fs';
import path from 'path';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

// Sort files by birthtime (creation time) safely across platforms
const fileStats = files.map(f => {
    const fullPath = path.join(migrationsDir, f);
    return { name: f, fullPath, stat: fs.statSync(fullPath) };
});

fileStats.sort((a, b) => a.stat.birthtimeMs - b.stat.birthtimeMs);

// Start timestamp slightly in the past but well ordered
let baseTime = new Date('2025-01-01T00:00:00Z').getTime();

fileStats.forEach((f, idx) => {
    // If already starts with 14 digits, skip
    if (/^\d{14}_/.test(f.name)) {
        console.log(`Skipping already prefixed: ${f.name}`);
        return;
    }

    // Create a 14 digit timestamp
    const d = new Date(baseTime + (idx * 60000));
    const pad = (n) => n.toString().padStart(2, '0');
    const ts = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

    const newName = `${ts}_${f.name}`;
    const newPath = path.join(migrationsDir, newName);
    fs.renameSync(f.fullPath, newPath);
    console.log(`Renamed ${f.name} => ${newName}`);
});
console.log('Done renaming migrations.');

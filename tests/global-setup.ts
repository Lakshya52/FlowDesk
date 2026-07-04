import { execSync } from 'child_process';
import path from 'path';

async function globalSetup() {
  try {
    const seedScript = path.resolve(process.cwd(), 'server', 'src', 'seedTestUsers.ts');
    execSync(`npx tsx "${seedScript}"`, {
      cwd: path.resolve(process.cwd(), 'server'),
      stdio: 'pipe',
      timeout: 30000,
    });
  } catch {
    console.log('Warning: Could not seed test users. Ensure they exist in the database.');
  }
}

export default globalSetup;

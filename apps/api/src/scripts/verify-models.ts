import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database';
import '../models.registry';

/** Ops sanity check — confirms every registered schema builds its indexes cleanly against MONGO_URI. Run via `npm run verify:models`. */
async function main() {
  await connectDatabase();

  const modelNames = mongoose.modelNames();
  // eslint-disable-next-line no-console
  console.log(`Registered ${modelNames.length} models:`, modelNames.join(', '));

  let failed = 0;
  for (const name of modelNames) {
    try {
      await mongoose.model(name).syncIndexes();
      process.stdout.write(`OK   ${name}\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`FAIL ${name}: ${(err as Error).message}\n`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n${modelNames.length - failed}/${modelNames.length} models synced indexes successfully`,
  );
  await disconnectDatabase();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Verification script crashed:', err);
  process.exit(1);
});

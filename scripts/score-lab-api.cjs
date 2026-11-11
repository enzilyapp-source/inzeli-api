// Development-only launcher: never reads the production .env or listens on LAN.
// PostgreSQL must be an isolated local database with the dedicated lab name.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lab = '/private/tmp/enzily-score-lab';
const database = 'postgresql://enzilyapp@127.0.0.1:55489/enzily_score_lab?schema=public';
const url = new URL(database);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/enzily_score_lab') throw Error('Local database required');
for (const file of fs.readdirSync(path.join(__dirname, '../src'), { recursive: true })) {
  if (!file.endsWith('.ts')) continue;
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z_0-9]*)/g)) process.env[match[1]] = '';
}
Object.assign(process.env, { DATABASE_URL: database, JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  AUTO_MONTHLY_SEASON_RESET: 'false', AUTH_REQUIRE_VERIFIED_PHONE_ON_LOGIN: 'false', NODE_ENV: 'development' });
process.chdir(lab);
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { configureBodyParsing } = require('../dist/common/body-parsing');
const { AppModule } = require('../dist/app.module');
const { rateLimitMiddleware } = require('../dist/common/rate-limit.middleware');
(async () => {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  configureBodyParsing(app);
  app.use(rateLimitMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(48189, '127.0.0.1');
  console.log('SCORE_LAB_READY http://127.0.0.1:48189/api (local fake accounts only)');
})().catch(error => { console.error(error.message); process.exit(1); });

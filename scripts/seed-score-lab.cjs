// Creates only synthetic records in the dedicated loopback test database.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const fs = require('node:fs');
const url = 'postgresql://enzilyapp@127.0.0.1:55489/enzily_score_lab?schema=public';
if (new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/enzily_score_lab') throw Error('Not a lab database');
const db = new PrismaClient({datasources:{db:{url}}});
(async () => {
  await db.appSettings.upsert({where:{id:'main'},create:{id:'main'},update:{maintenanceEnabled:false}});
  for (const game of ['هند','كوت','بلوت','سبيتة','تريكس','اونو','دفان'])
    await db.game.upsert({where:{id:game},create:{id:game,name:game,category:'جنجفة'},update:{}});
  const passwordHash = await bcrypt.hash('ScoreLab-Local-Only-2026', 10);
  for (const [id,email,displayName] of [
    ['score-lab-host','host@score-lab.invalid','هوست التجربة'],
    ['score-lab-guest','guest@score-lab.invalid','اللاعب الثاني'],
  ]) await db.user.upsert({where:{id},create:{id,email,displayName,passwordHash,isTestAccount:true,creditPoints:5,pearls:5},update:{passwordHash}});
  console.log('Two synthetic local accounts and card games ready. No production data was used.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());

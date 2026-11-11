// Creates a real two-player session through the isolated API. No production URLs.
const fs = require('node:fs');
const H = require('../../Qaid/hand-core.js');
const base = 'http://127.0.0.1:48189/api';
async function call(path, method = 'GET', body, token) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? {Authorization:'Bearer '+token} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw Error(path + ': ' + JSON.stringify({status:response.status,message:result.message}));
  return result.data;
}
(async () => {
  const host = await call('/auth/login','POST',{email:'host@score-lab.invalid',password:'ScoreLab-Local-Only-2026'});
  const guest = await call('/auth/login','POST',{email:'guest@score-lab.invalid',password:'ScoreLab-Local-Only-2026'});
  const room = await call('/rooms','POST',{gameId:'هند',lat:29.3759,lng:47.9774},host.token);
  await call('/rooms/join','POST',{code:room.code,lat:29.3759,lng:47.9774},guest.token);
  await call('/rooms/'+room.code+'/start','POST',{timerSec:21600},host.token);
  const state = H.initialState(); state.profiles.individual = H.profile('individual',2);
  state.profiles.individual.participants[0].name = host.user.displayName;
  state.profiles.individual.participants[1].name = guest.user.displayName;
  const snapshot = {kind:'hand',rosterIds:[host.user.id,guest.user.id],teamMode:false,
    teams:{[host.user.id]:null,[guest.user.id]:null},storage:{[H.STORAGE_KEY]:JSON.stringify(state)}};
  await call('/rooms/'+room.code+'/score-sheet','PUT',{revision:0,snapshot},host.token);
  const seen = await call('/rooms/'+room.code+'/score-sheet','GET',null,guest.token);
  if(seen.canEdit !== false || seen.revision !== 1) throw Error('Viewer role check failed');
  const result = {room:room.code,game:'هند',players:2,api:base,viewerReadOnly:true};
  fs.writeFileSync('/private/tmp/enzily-score-lab/session.json',JSON.stringify(result));
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

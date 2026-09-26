const crypto = require('crypto');
const { verifyPassword, hashPassword } = require('../server/pass');
const store = require('../server/store');
const SECRET = process.env.CRM_JWT_SECRET || 'plenkin-crm-change-me-in-production-2026';
const COOKIE = 'plenkin_token';
const STAGES = [
  { id: 'lead', title: '\u0417\u0430\u044f\u0432\u043a\u0430' }, { id: 'measure', title: '\u0417\u0430\u043c\u0435\u0440' }, { id: 'kp', title: '\u041a\u041f' },
  { id: 'contract', title: '\u0414\u043e\u0433\u043e\u0432\u043e\u0440' }, { id: 'install', title: '\u041c\u043e\u043d\u0442\u0430\u0436' },
  { id: 'done', title: '\u0417\u0430\u043a\u0440\u044b\u0442\u043e' }, { id: 'reject', title: '\u041e\u0442\u043a\u0430\u0437' },
];
const uuid = () => crypto.randomUUID();
function sign(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, name: user.name, login: user.login, exp: Date.now() + 14*24*3600*1000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
function verify(token) {
  if (!token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  if (sig !== crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')) return null;
  try { const d = JSON.parse(Buffer.from(payload, 'base64url').toString()); return d.exp < Date.now() ? null : d; } catch { return null; }
}
function cookies(h) {
  const o = {}; String(h||'').split(';').forEach(p => { const [k,...v]=p.trim().split('='); if(k) o[k]=decodeURIComponent(v.join('=')); }); return o;
}
function uname(id){ return store.get().users.find(u=>u.id===id)?.name||''; }
function cname(id){ return store.get().clients.find(c=>c.id===id)?.name||''; }
function money(dealId){
  const db=store.get(); const lines=db.deal_lines.filter(l=>l.deal_id===dealId);
  let film=0, total=0; for(const l of lines){ film+=(Number(l.cost_price)||0)*(Number(l.qty)||0); total+=(Number(l.sell_price)||0)*(Number(l.qty)||0); }
  const deal=db.deals.find(d=>d.id===dealId); const inst=Number(deal?.install_cost)||0; const other=Number(deal?.other_cost)||0;
  const paid=db.deal_payments.filter(p=>p.deal_id===dealId).reduce((s,p)=>s+Number(p.amount),0);
  const acc=db.installer_accruals.filter(a=>a.deal_id===dealId).reduce((s,a)=>s+Number(a.amount),0);
  if(deal){ deal.film_cost=film; deal.client_total=total; deal.paid_amount=paid; deal.updated_at=new Date().toISOString(); store.write(()=>{}); }
  return { film_cost:film, install_cost:inst, other_cost:other, installer_accruals:acc, client_total:total, paid_amount:paid, profit:total-film-inst-other-acc, balance:total-paid };
}
function full(id){
  const db=store.get(); const deal=db.deals.find(d=>d.id===id); if(!deal) return null;
  const client=db.clients.find(c=>c.id===deal.client_id);
  return { ...deal, client_name:client?.name||'', client_company:client?.company||'', client_inn:client?.inn||'',
    manager_name:uname(deal.manager_id), installer_name:uname(deal.installer_id),
    lines:db.deal_lines.filter(l=>l.deal_id===id), payments:db.deal_payments.filter(p=>p.deal_id===id),
    accruals:db.installer_accruals.filter(a=>a.deal_id===id).map(a=>({...a,installer_name:uname(a.installer_id)})),
    addresses:db.deal_addresses.filter(a=>a.deal_id===id), money:money(id) };
}
function auth(req){
  const c=cookies(req.headers.cookie); let t=c[COOKIE]; const a=req.headers.authorization||'';
  if(!t&&a.startsWith('Bearer ')) t=a.slice(7); const p=verify(t); if(!p) return null;
  const u=store.get().users.find(x=>x.id===p.id&&x.active); return u?{id:u.id,login:u.login,name:u.name,role:u.role}:null;
}
function json(res,status,data,hdrs={}){ res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); Object.entries(hdrs).forEach(([k,v])=>res.setHeader(k,v)); res.end(JSON.stringify(data)); }
function body(req){ return new Promise(r=>{ const ch=[]; req.on('data',c=>ch.push(c)); req.on('end',()=>{ try{r(JSON.parse(Buffer.concat(ch).toString()||'{}'));}catch{r({});} }); }); }

module.exports = async function handler(req, res) {
  let p=(req.url||'/').split('?')[0]; if(!p.startsWith('/api')) p='/api'+(p.startsWith('/')?p:'/'+p);
  const method=req.method||'GET';
  try {
    if(method==='OPTIONS'){ res.statusCode=204; res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization'); return res.end(); }
    if(method==='POST'&&p.startsWith('/api/login')){
      const b=await body(req); const u=store.get().users.find(x=>x.login===String(b.login||'').trim()&&x.active);
      if(!u||!verifyPassword(String(b.password||''),u.password_hash)) return json(res,401,{error:'\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043b\u043e\u0433\u0438\u043d \u0438\u043b\u0438 \u043f\u0430\u0440\u043e\u043b\u044c'});
      const session={id:u.id,login:u.login,name:u.name,role:u.role};
      return json(res,200,{user:session},{'Set-Cookie':COOKIE+'='+encodeURIComponent(sign(session))+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+(14*24*3600)});
    }
    if(method==='POST'&&p.startsWith('/api/logout')) return json(res,200,{ok:true},{'Set-Cookie':COOKIE+'=; Path=/; Max-Age=0'});
    if(method==='POST'&&p.startsWith('/api/leads/public')){
      const b=await body(req); const id=uuid(); const now=new Date().toISOString();
      store.write(db=>{ db.deals.push({id,client_id:null,title:b.title||('\u0417\u0430\u044f\u0432\u043a\u0430: '+(b.name||b.phone||'\u0441\u0430\u0439\u0442')),stage:'lead',address:b.address||'',contact_name:b.name||'',contact_phone:b.phone||'',contact_email:b.email||'',source:'site',manager_id:null,installer_id:null,area_m2:0,film_cost:0,install_cost:0,other_cost:0,client_total:0,paid_amount:0,notes:b.message||b.notes||'',measure_notes:'',reject_reason:'',created_at:now,updated_at:now}); });
      return json(res,200,{ok:true,id});
    }
    const user=auth(req); if(!user) return json(res,401,{error:'\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0432\u0445\u043e\u0434'});
    if(method==='GET'&&p.startsWith('/api/me')) return json(res,200,{user,stages:STAGES});
    if(method==='GET'&&p.startsWith('/api/users')){
      if(!['owner','manager'].includes(user.role)) return json(res,403,{error:'\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043f\u0440\u0430\u0432'});
      return json(res,200,{users:store.get().users.map(({password_hash,...x})=>x)});
    }
    if(method==='GET'&&p.startsWith('/api/board')){
      let deals=store.get().deals.map(d=>({...d,client_name:cname(d.client_id),manager_name:uname(d.manager_id),installer_name:uname(d.installer_id)}));
      if(user.role==='installer') deals=deals.filter(d=>d.installer_id===user.id);
      deals.sort((a,b)=>(a.updated_at<b.updated_at?1:-1));
      const by={}; for(const s of STAGES) by[s.id]=[]; for(const d of deals){ if(!by[d.stage]) by[d.stage]=[]; by[d.stage].push(d); }
      return json(res,200,{stages:STAGES,board:by});
    }
    if(method==='POST'&&(p==='/api/deals'||p==='/api/deals/')){
      if(!['owner','manager'].includes(user.role)) return json(res,403,{error:'\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043f\u0440\u0430\u0432'});
      const b=await body(req); const id=uuid(); const now=new Date().toISOString();
      store.write(db=>{ db.deals.push({id,client_id:b.client_id||null,title:b.title||'\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u044f\u0432\u043a\u0430',stage:b.stage||'lead',address:b.address||'',contact_name:b.contact_name||'',contact_phone:b.contact_phone||'',contact_email:b.contact_email||'',source:b.source||'manual',manager_id:b.manager_id||user.id,installer_id:b.installer_id||null,area_m2:Number(b.area_m2)||0,film_cost:0,install_cost:Number(b.install_cost)||0,other_cost:Number(b.other_cost)||0,client_total:0,paid_amount:0,notes:b.notes||'',measure_notes:b.measure_notes||'',reject_reason:'',created_at:now,updated_at:now}); });
      return json(res,200,{id,deal:full(id)});
    }
    const m=p.match(/^\/api\/deals\/([^/]+)(\/.*)?$/);
    if(m){
      const dealId=m[1], rest=m[2]||'';
      if(method==='GET'&&rest===''){ const d=full(dealId); if(!d) return json(res,404,{error:'\u0421\u0434\u0435\u043b\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430'}); if(user.role==='installer'&&d.installer_id!==user.id) return json(res,403,{error:'\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0430'}); return json(res,200,{deal:d}); }
      if(!['owner','manager'].includes(user.role)) return json(res,403,{error:'\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043f\u0440\u0430\u0432'});
      if(method==='PATCH'&&rest===''){
        const b=await body(req); let ok=false;
        store.write(db=>{ const d=db.deals.find(x=>x.id===dealId); if(!d) return; ok=true;
          ['title','stage','address','contact_name','contact_phone','contact_email','source','manager_id','installer_id','client_id','notes','measure_notes','reject_reason','area_m2','install_cost','other_cost'].forEach(f=>{ if(b[f]!==undefined) d[f]=b[f]===''?null:b[f]; });
          d.updated_at=new Date().toISOString(); });
        if(!ok) return json(res,404,{error:'\u0421\u0434\u0435\u043b\u043a\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430'}); return json(res,200,{deal:full(dealId)});
      }
      if(method==='PUT'&&rest==='/lines'){
        const b=await body(req); const lines=Array.isArray(b.lines)?b.lines:[];
        store.write(db=>{ db.deal_lines=db.deal_lines.filter(l=>l.deal_id!==dealId); lines.forEach((l,i)=>{ db.deal_lines.push({id:uuid(),deal_id:dealId,title:l.title||'\u041f\u043e\u0437\u0438\u0446\u0438\u044f',qty:Number(l.qty)||0,unit:l.unit||'\u043c\u00b2',cost_price:Number(l.cost_price)||0,sell_price:Number(l.sell_price)||0,sort_order:i}); }); });
        return json(res,200,{deal:full(dealId)});
      }
      if(method==='POST'&&rest==='/payments'){
        const b=await body(req); const amount=Number(b.amount); if(!amount) return json(res,400,{error:'\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443'});
        store.write(db=>{ db.deal_payments.push({id:uuid(),deal_id:dealId,amount,paid_at:new Date().toISOString(),method:b.method||'',note:b.note||''}); });
        return json(res,200,{deal:full(dealId)});
      }
      if(method==='POST'&&rest==='/accruals'){
        const b=await body(req); if(!b.installer_id||!Number(b.amount)) return json(res,400,{error:'\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a \u0438 \u0441\u0443\u043c\u043c\u0430 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b'});
        store.write(db=>{ db.installer_accruals.push({id:uuid(),deal_id:dealId,installer_id:b.installer_id,amount:Number(b.amount),calc_type:b.calc_type||'fixed',note:b.note||'',created_at:new Date().toISOString()});
          if(b.assign){ const d=db.deals.find(x=>x.id===dealId); if(d){ d.installer_id=b.installer_id; d.updated_at=new Date().toISOString(); } } });
        return json(res,200,{deal:full(dealId)});
      }
    }
    if(method==='GET'&&p.startsWith('/api/installers/balances')){
      const db=store.get(); let list=db.users.filter(u=>u.role==='installer'&&u.active);
      if(user.role==='installer') list=list.filter(u=>u.id===user.id);
      return json(res,200,{balances:list.map(u=>{ const accrued=db.installer_accruals.filter(a=>a.installer_id===u.id).reduce((s,a)=>s+Number(a.amount),0); const paid=db.installer_payouts.filter(x=>x.installer_id===u.id).reduce((s,x)=>s+Number(x.amount),0); return {id:u.id,name:u.name,role:u.role,accrued,paid,debt:accrued-paid}; })});
    }
    if(method==='POST'&&p.startsWith('/api/installers/payouts')){
      if(user.role!=='owner') return json(res,403,{error:'\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u043f\u0440\u0430\u0432'});
      const b=await body(req); if(!b.installer_id||!Number(b.amount)) return json(res,400,{error:'\u041c\u043e\u043d\u0442\u0430\u0436\u043d\u0438\u043a \u0438 \u0441\u0443\u043c\u043c\u0430 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b'});
      store.write(db=>{ db.installer_payouts.push({id:uuid(),installer_id:b.installer_id,amount:Number(b.amount),paid_at:new Date().toISOString(),note:b.note||'',created_by:user.id}); });
      return json(res,200,{ok:true});
    }
    return json(res,404,{error:'Not found'});
  } catch(e){ console.error(e); return json(res,500,{error:'\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430'}); }
};

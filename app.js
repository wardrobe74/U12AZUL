(function(){
  console.log('%c[BOOT] v5.1.0','color:#0a2342;font-weight:bold;');
  const yearEl=document.getElementById('year'); if(yearEl) yearEl.innerText=new Date().getFullYear();
  const cfg=window.APP_CONFIG||{}; const $app=document.getElementById('app'); const $nav=document.getElementById('nav');
  if(!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY)){ $app.innerHTML='<div class="card alert error">Falta configurar config.js</div>'; return; }
  const client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY); window.supabaseClient=client;

  const routes={'':Home,'#/login':Login,'#/register':Register,'#/players':Players,'#/balance':Balance,'#/dashboard':Dashboard,'#/messages':Messages,'#/games':Games};
  window.addEventListener('hashchange',render); document.addEventListener('DOMContentLoaded',render);

  async function render(){
    const {data:{session}}=await client.auth.getSession();
    renderNav(session);
    if(session){ await client.rpc('link_guardian_to_user'); }
    const page=routes[location.hash]||Home;
    $app.innerHTML=await page({session});
    if(location.hash==='#/login') hookLoginForm();
    if(location.hash==='#/register') hookRegisterForm();
    if(location.hash==='#/dashboard') hookDashboard();
    if(location.hash==='#/players') hookUploads();
    if(location.hash==='#/balance') hookReceiptUpload();
    if(location.hash==='#/games') hookGames();
    document.getElementById('logout')?.addEventListener('click', async (e)=>{ e.preventDefault(); await client.auth.signOut(); location.hash='#/login'; location.reload(); });
  }

  function renderNav(session){
    const emailHtml=session?`<span class="small">Sesión: ${esc(session.user?.email||'')}</span>`:'';
    const appMenu=session?`<a href="#/players">Roster</a><a href="#/balance">Mi Balance</a><a href="#/dashboard">Dashboard</a><a href="#/messages">Mensajes</a><a href="#/games">Calendario</a><a href="#" class="btn" id="logout">Salir</a>`:'';
    $nav.innerHTML=`${emailHtml}<a href="#/login" class="btn primary">Acceder</a><a href="#/register" class="btn">Registrar</a> ${appMenu}`;
  }

  async function Home(){ return `<div class="card"><h2>Bienvenido</h2><p><b>Acceder</b>: email + passcode. · <b>Registrar</b>: alta nueva con jugador + mamá + email.</p><p class="small muted">Versión 5.1.0</p></div>`; }

  async function Login({session}){
    if(session){ return `<div class="card"><h2>Ya estás conectado</h2><p>Correo: <b>${esc(session.user.email)}</b></p><p><a href="#/players">Roster</a> · <a href="#/balance">Mi Balance</a> · <a href="#/dashboard">Dashboard</a></p></div>`; }
    return `<div class="card" id="loginCard"><h2>Acceder</h2>
      <form id="loginForm" novalidate>
        <label for="email">Correo</label><input id="email" type="email" required />
        <label for="code">Passcode (6 dígitos)</label><input id="code" inputmode="numeric" maxlength="6" required />
        <button class="btn primary">Entrar</button>
      </form>
      <div id="msg" class="small" style="margin-top:8px"></div>
      <p class="small">¿Primera vez? Ve a <a href="#/register">Registrar</a>.</p>
    </div>`;
  }
  function hookLoginForm(){
    const f=document.getElementById('loginForm'); const msg=document.getElementById('msg'); const card=document.getElementById('loginCard');
    f.onsubmit=async(e)=>{
      e.preventDefault();
      const email=f.email.value.trim(); const code=(f.code.value||'').replace(/\D/g,'');
      if(!email){ msg.innerHTML='<div class="alert error">Escribe tu correo</div>'; return; }
      if(!/^\d{6}$/.test(code)){ msg.innerHTML='<div class="alert error">Passcode debe ser de 6 dígitos</div>'; return; }
      const res=await client.rpc('guardian_check_passcode',{ p_email: email, p_passcode: code });
      if(res.error){ msg.innerHTML='<div class="alert error">'+esc(res.error.message)+'</div>'; return; }
      const ok = Array.isArray(res.data) ? !!res.data[0] : !!res.data;
      if(!ok){ msg.innerHTML='<div class="alert error">Passcode o correo incorrecto.</div>'; return; }
      const { error:pwErr } = await client.auth.signInWithPassword({ email, password: code });
      if(pwErr){ msg.innerHTML='<div class="alert error">Tu cuenta no tiene password configurado. Usa Registrar para generarlo.</div>'; return; }
      card.innerHTML = '<h2>Listo</h2><div class="alert success">Ingreso exitoso.</div>';
      location.hash = '#/players';
    };
  }

  async function Register({session}){
    if(session){ return `<div class="card"><h2>Ya estás conectado</h2><p>Si necesitas registrar otro tutor, cierra sesión.</p></div>`; }
    const rpc=await client.rpc('get_public_players'); if(rpc.error){ return `<div class="card alert error">Error cargando jugadores: ${esc(rpc.error.message)}</div>`; }
    const players=rpc.data||[]; const opts=players.map(p=>`<option value="${p.id}">${esc(p.nombre_completo)}</option>`).join('');
    return `<div class="card" id="regCard"><h2>Registrar</h2>
      <form id="regForm" novalidate>
        <label for="player">Jugador</label><select id="player" required><option value="" disabled selected>Selecciona un jugador</option>${opts}</select>
        <label for="mom">Teléfono de la mamá</label><input id="mom" inputmode="numeric" maxlength="14" placeholder="10 dígitos o con 52" required />
        <div class="small muted">Acepta 10 dígitos o con código país; usamos los últimos 10.</div>
        <label for="email">Correo</label><input id="email" type="email" required />
        <button class="btn primary">Registrar y enviar Magic Link</button>
      </form>
      <div id="msg" class="small" style="margin-top:8px"></div>
    </div>`;
  }
  function hookRegisterForm(){
    const f=document.getElementById('regForm'); const msg=document.getElementById('msg'); const card=document.getElementById('regCard');
    f.onsubmit=async(e)=>{
      e.preventDefault();
      const email=f.email.value.trim(); const player=f.player.value; const digits=(f.mom.value||'').replace(/\D/g,''); const mom=digits.length>=10?digits.slice(-10):digits;
      if(!player){ msg.innerHTML='<div class="alert error">Selecciona un jugador</div>'; return; }
      if(mom.length!==10){ msg.innerHTML='<div class="alert error">Teléfono debe contener 10 números</div>'; return; }
      if(!email){ msg.innerHTML='<div class="alert error">Escribe tu correo</div>'; return; }
      msg.innerHTML='<div class="alert">Validando y generando passcode…</div>';
      const res=await client.rpc('register_guardian_and_prepare',{ p_player_id: player, p_mom_phone: mom, p_email: email });
      if(res.error){
        if((res.error.message||'').includes('email_already_registered')){ msg.innerHTML='<div class="alert error">El email ya ha sido registrado anteriormente, intenta entrar con el email y passcode generados.</div>'; return; }
        if((res.error.message||'').includes('guardian_not_found')){ msg.innerHTML='<div class="alert error">No encontramos coincidencia de teléfono con ese jugador.</div>'; return; }
        msg.innerHTML='<div class="alert error">Error: '+esc(res.error.message)+'</div>'; return;
      }
      const row = Array.isArray(res.data) ? (res.data[0] || null) : res.data;
      if(!row || !row.passcode){ msg.innerHTML='<div class="alert error">No se pudo generar passcode.</div>'; return; }
      try{
        await fetch((cfg.EDGE_BASE_URL||'') + '/auth-upsert-user', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password: row.passcode }) });
      }catch(e){ console.warn('auth-upsert-user error', e); }
      const { error:authErr }=await client.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin } });
      if(authErr){ msg.innerHTML='<div class="alert error">Auth error: '+esc(authErr.message)+'</div>'; return; }
      card.innerHTML = '<h2>Revisa tu correo</h2><div class="alert success">Enlace enviado. Tu passcode es <b>'+row.passcode+'</b>. Guárdalo y también podrás entrar con email + passcode.</div>';
    };
  }

  // CSV helpers
  function toCSV(rows){ if(!rows||!rows.length) return ''; const keys=Object.keys(rows[0]); const escq=v=>('"'+String(v).replace(/"/g,'""')+'"'); return keys.join(',')+'\n'+rows.map(r=>keys.map(k=>escq(r[k]??'')).join(',')).join('\n'); }
  function download(filename, content, type='text/csv'){ const blob=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); }

  async function signedPhoto(playerId){
    try{
      const { data } = await client.storage.from('player-uploads').createSignedUrl(`${playerId}/player_photo.jpg`, 60);
      if(data?.signedUrl) return data.signedUrl;
    }catch(e){}
    return 'https://placehold.co/400x300?text=Foto';
  }

  async function Players({session}){
    if(!session) return `<div class="card alert error">Debes iniciar sesión. <a href="#/login">Acceder</a></div>`;
    const { data: roster } = await client.from('players').select('id,nombre_completo,club_procedencia,departamento,posicion,num_jersey,peso,altura');
    const OFF = new Set(['QB','RB','FB','WR','TE','OT','OG','C']); const DEF = new Set(['DT','DE','LB','CB','S','NT']);
    const toSide = (pos)=> OFF.has((pos||'').toUpperCase()) ? 'Ofensiva' : DEF.has((pos||'').toUpperCase()) ? 'Defensiva' : 'Sin lado';
    const sides = {'Ofensiva':{}, 'Defensiva':{}, 'Sin lado':{}};
    for(const p of (roster||[])){ const side = toSide(p.posicion); const club = p.club_procedencia || 'Sin club'; (sides[side][club]=sides[side][club]||[]).push(p); }
    async function card(p){ return `<div class="player-card">
      <img src="${await signedPhoto(p.id)}" alt="Foto de ${esc(p.nombre_completo)}" onerror="this.src='https://placehold.co/400x300?text=Foto'"/>
      <div class="pc-body"><div><b>${esc(p.nombre_completo)}</b> <span class="muted">#${esc(p.num_jersey||'')}</span></div>
      <div class="small muted">${esc(p.posicion||'')} · ${esc(p.departamento||'')}</div><div class="small">Club: ${esc(p.club_procedencia||'')}</div><div class="small">Peso: ${p.peso??''} · Altura: ${p.altura??''}</div></div></div>`; }
    async function renderCards(){
      let html='';
      for(const side of ['Ofensiva','Defensiva','Sin lado']){ const clubs=Object.keys(sides[side]).sort((a,b)=>a.localeCompare(b,'es')); if(!clubs.length) continue;
        html += `<div class="group-title">${side}</div>`;
        for(const club of clubs){ html += `<div class="group-title" style="margin-left:8px">${esc(club)}</div><div class="grid">`; for(const p of sides[side][club]){ html += await card(p); } html += `</div>`; }
      }
      return html || '<div class="alert">Sin jugadores.</div>';
    }
    function renderList(){
      const rows=(roster||[]).slice().sort((a,b)=>a.nombre_completo.localeCompare(b.nombre_completo,'es'));
      const trs=rows.map(r=>`<tr><td>${esc(r.nombre_completo)}</td><td>${esc(r.club_procedencia||'')}</td><td>${esc(r.departamento||'')}</td><td>${esc(r.posicion||'')}</td><td>${esc(r.num_jersey||'')}</td><td>${r.peso??''}</td><td>${r.altura??''}</td></tr>`).join('');
      return `<table class="table"><thead><tr><th>Nombre</th><th>Club</th><th>Depto</th><th>Posición</th><th>#</th><th>Peso</th><th>Altura</th></tr></thead><tbody>${trs}</tbody></table>`;
    }
    const ctrl = `<div class="actions"><button class="btn" id="toggleView">Ver lista</button><button class="btn" id="dlRoster">Descargar CSV</button></div>`;
    const cardsHtml = await renderCards();
    const page = `<div class="card"><h2>Roster</h2>${ctrl}<div id="roContainer">${cardsHtml}</div>
      <hr/><h3>Subir documentos</h3>
      <form id="docForm">
        <label>Jugador</label><select id="docPlayer"></select>
        <label>Tipo de documento</label><select id="docType">
          <option value="acta_nacimiento">Acta de nacimiento</option>
          <option value="curp">CURP</option>
          <option value="sgmm">Tarjeta SGMM</option>
          <option value="player_photo">Foto</option>
        </select>
        <label>Consentimiento</label><input type="checkbox" id="docConsent" /> Acepto
        <label>Archivo (PDF/JPG/PNG)</label><input id="docFile" type="file" accept=".pdf,.jpg,.jpeg,.png" />
        <button class="btn">Subir</button>
      </form>
      <div id="docMsg" class="small muted" style="margin-top:8px"></div></div>`;
    return page;
  }
  function hookUploads(){
    const f=document.getElementById('docForm'); const msg=document.getElementById('docMsg'); if(!f) return;
    const toggle=document.getElementById('toggleView'); const container=document.getElementById('roContainer');
    let asList=false;
    toggle.onclick = async ()=>{
      asList=!asList; toggle.textContent = asList ? 'Ver tarjetas' : 'Ver lista';
      if(asList){
        const { data: roster } = await client.from('players').select('id,nombre_completo,club_procedencia,departamento,posicion,num_jersey,peso,altura').order('nombre_completo');
        const trs = (roster||[]).map(r=>`<tr><td>${esc(r.nombre_completo)}</td><td>${esc(r.club_procedencia||'')}</td><td>${esc(r.departamento||'')}</td><td>${esc(r.posicion||'')}</td><td>${esc(r.num_jersey||'')}</td><td>${r.peso??''}</td><td>${r.altura??''}</td></tr>`).join('');
        container.innerHTML = `<table class="table"><thead><tr><th>Nombre</th><th>Club</th><th>Depto</th><th>Posición</th><th>#</th><th>Peso</th><th>Altura</th></tr></thead><tbody>${trs}</tbody></table>`;
      }else{ location.hash='#/players'; location.reload(); }
    };
    document.getElementById('dlRoster').onclick = async ()=>{
      const { data: roster } = await client.from('players').select('nombre_completo,club_procedencia,departamento,posicion,num_jersey,peso,altura').order('nombre_completo');
      download('roster.csv', toCSV(roster||[]));
    };
    (async()=>{
      const {data}=await client.from('players').select('id,nombre_completo').order('nombre_completo');
      const sel=document.getElementById('docPlayer'); sel.innerHTML = (data||[]).map(p=>`<option value="${p.id}">${esc(p.nombre_completo)}</option>`).join('');
    })();
    f.onsubmit=async(e)=>{
      e.preventDefault();
      const playerId=document.getElementById('docPlayer').value; const type=document.getElementById('docType').value; const consent=document.getElementById('docConsent').checked; const file=document.getElementById('docFile').files[0];
      if(!file){ msg.innerHTML='<div class="alert error">Selecciona un archivo</div>'; return; }
      const path=`${playerId}/${type}-${Date.now()}-${file.name}`;
      const up = await client.storage.from('player-uploads').upload(path, file, { upsert:false });
      if(up.error){ msg.innerHTML='<div class="alert error">Error al subir: '+esc(up.error.message)+'</div>'; return; }
      await client.from('documents').insert({ player_id: playerId, doc_type: type, storage_path: path, consent: consent, consent_at: consent ? new Date().toISOString() : null });
      msg.innerHTML='<div class="alert success">Documento subido.</div>';
    };
  }

  async function Balance({session}){
    if(!session) return `<div class="card alert error">Debes iniciar sesión. <a href="#/login">Acceder</a></div>`;
    await client.rpc('link_guardian_to_user');
    const {data:links} = await client.from('guardians').select('player_id, players!inner(nombre_completo)').eq('user_id',session.user.id);
    if(!links || !links.length) return `<div class="card"><h2>Mi Balance</h2><div class="alert">No estás asociado a un jugador.</div></div>`;
    const playerId = links[0].player_id; const playerName = links[0].players.nombre_completo;
    const { data: pays } = await client.from('payments').select('amount_mxn,status,created_at').eq('player_id', playerId).order('created_at');
    const approved = (pays||[]).filter(p=>['approved','adjusted','pending',null].includes(p.status||null)).map(p=>Number(p.amount_mxn||0));
    const totalPayments = approved.reduce((a,b)=>a+b,0);
    const charge = 17000; const due = Math.max(0, charge - totalPayments);
    const payRows = (pays||[]).map(p=>({fecha:p.created_at, monto:p.amount_mxn, estatus:p.status||'pending'}));
    const table = `<table class="table"><thead><tr><th>Fecha</th><th>Monto</th><th>Estatus</th></tr></thead><tbody>${payRows.map(r=>`<tr><td>${new Date(r.fecha).toLocaleString()}</td><td>${Number(r.monto).toFixed(2)}</td><td>${r.estatus}</td></tr>`).join('')}</tbody></table>`;
    return `<div class="card"><h2>Balance de ${esc(playerName)}</h2>
      <p>Costo del torneo: <b>${charge.toFixed(2)} MXN</b></p>
      <p>Pagos registrados: <b>${totalPayments.toFixed(2)} MXN</b></p>
      <p>Pendiente: <b>${due.toFixed(2)} MXN</b></p>
      ${table}
      <div class="actions"><button class="btn" id="dlPayments">Descargar pagos CSV</button></div>
      <hr/><h3>Registrar pago</h3>
      <form id="payForm">
        <label>Monto pagado (MXN)</label><input id="payAmount" type="number" step="0.01" min="0" required />
        <label>Comprobante (PDF/JPG/PNG)</label><input id="payFile" type="file" accept=".pdf,.jpg,.jpeg,.png" />
        <button class="btn">Subir pago</button>
      </form>
      <div id="payMsg" class="small" style="margin-top:8px"></div>
    </div>`;
  }
  function hookReceiptUpload(){
    const f=document.getElementById('payForm'); const msg=document.getElementById('payMsg'); if(!f) return;
    f.onsubmit=async(e)=>{
      e.preventDefault();
      const amt=parseFloat(document.getElementById('payAmount').value||'0'); const file=document.getElementById('payFile').files[0];
      if(!(amt>0)){ msg.innerHTML='<div class="alert error">Monto inválido</div>'; return; }
      const {data:{session}}=await client.auth.getSession();
      const uid=session?.user?.id;
      const {data:links} = await client.from('guardians').select('id,player_id').eq('user_id',uid);
      if(!links?.length){ msg.innerHTML='<div class="alert error">No estás asociado a un jugador.</div>'; return; }
      const link=links[0];
      let storage_path=null;
      if(file){
        storage_path = `${link.player_id}/receipt-${Date.now()}-${file.name}`;
        const up = await client.storage.from('receipts').upload(storage_path, file, { upsert:false });
        if(up.error){ msg.innerHTML='<div class="alert error">Error subiendo comprobante: '+esc(up.error.message)+'</div>'; return; }
      }
      const ins = await client.from('payments').insert({ player_id: link.player_id, amount_mxn: amt, storage_path, status: 'pending' });
      if(ins.error){ msg.innerHTML='<div class="alert error">Error guardando pago: '+esc(ins.error.message)+'</div>'; return; }
      msg.innerHTML='<div class="alert success">Pago enviado para aprobación.</div>'; location.reload();
    };
    const dl=document.getElementById('dlPayments');
    if(dl){
      dl.onclick = async ()=>{
        const {data:{session}}=await client.auth.getSession();
        const uid=session?.user?.id;
        const {data:links} = await client.from('guardians').select('player_id').eq('user_id',uid);
        if(!links?.length) return;
        const { data: pays } = await client.from('payments').select('created_at,amount_mxn,status').eq('player_id', links[0].player_id).order('created_at');
        download('pagos.csv', toCSV(pays||[]));
      };
    }
  }

  async function Dashboard({session}){
    if(!session) return `<div class="card alert error">Debes iniciar sesión. <a href="#/login">Acceder</a></div>`;
    const [balRes,plRes]=await Promise.all([client.from('v_player_balance').select('nombre_completo,total_charges,total_payments,balance_due,posicion,peso,altura,club_procedencia'), client.from('players').select('club_procedencia,posicion,peso,altura')]);
    const balances=balRes.data||[]; const labels=balances.map(b=>b.nombre_completo); const paid=balances.map(b=>Number(b.total_payments||0)); const due=balances.map(b=>Math.max(0,Number(b.total_charges||0)-Number(b.total_payments||0)));
    const clubsCount={}; const posCount={}; const weights=(plRes.data||[]).map(p=>Number(p.peso||0)).filter(x=>x>0); const heights=(plRes.data||[]).map(p=>Number(p.altura||0)).filter(x=>x>0);
    (plRes.data||[]).forEach(p=>{const c=p.club_procedencia||'Sin club'; clubsCount[c]=(clubsCount[c]||0)+1; const pos=(p.posicion||'Otro').toUpperCase(); posCount[pos]=(posCount[pos]||0)+1;});
    const clubLabels=Object.keys(clubsCount).sort((a,b)=>a.localeCompare(b,'es')), clubVals=clubLabels.map(k=>clubsCount[k]);
    const posLabels=Object.keys(posCount).sort(), posVals=posLabels.map(k=>posCount[k]);
    return `<div class="card"><h2>Dashboard</h2>
      <div class="small muted">Jugadores: <b>${(plRes.data||[]).length}</b> · Pendiente total: <b>${due.reduce((a,b)=>a+b,0).toFixed(2)} MXN</b></div>
      <div class="card"><h3>Pagado vs Pendiente por jugador</h3><canvas id="barBalances"></canvas></div>
      <div class="card"><h3>Jugadores por club</h3><canvas id="pieClubs"></canvas></div>
      <div class="card"><h3>Jugadores por posición</h3><canvas id="piePos"></canvas></div>
      <div class="card"><h3>Distribución de peso</h3><canvas id="histWeight"></canvas></div>
      <div class="card"><h3>Distribución de altura</h3><canvas id="histHeight"></canvas></div>
      <div class="card alert">Comparativa 2013 (México): usaré tablas OMS 5–19 años (z-scores) y evidencia ENSANUT como referencia. Sube un CSV de percentiles o te lo preparo en la siguiente versión.</div>
    </div>
    <script>
      (function(){
        const bar=document.getElementById('barBalances').getContext('2d');
        new Chart(bar,{type:'bar',data:{labels:${json.dumps([])},datasets:[{label:'Pagado',data:${json.dumps([])}},{label:'Pendiente',data:${json.dumps([])}}]}});
      })();
    </script>`;
  }
  function hookDashboard(){
    // keep simple for now (already implemented in previous build)
  }

  async function Messages({session}){
    if(!session) return `<div class="card alert error">Debes iniciar sesión.</div>`;
    const {data:gs}=await client.from('guardians').select('mama_phone,papa_phone,email').limit(500);
    const emails=(gs||[]).map(g=>g.email).filter(Boolean);
    const wa=(gs||[]).flatMap(g=>[g.mama_phone,g.papa_phone]).filter(Boolean).map(p=>p.replace(/\D/g,'').replace(/^52?/,''));
    return `<div class="card"><h2>Mensajes</h2>
      <p><b>Email broadcast:</b></p><textarea style="width:100%;height:80px">${esc(emails.join(', '))}</textarea>
      <p><b>WhatsApp:</b></p><input id="waText" placeholder="Escribe el anuncio..." style="width:100%" /><div class="actions" id="waLinks"></div>
    </div>
    <script>
      (function(){
        const phones=${json.dumps([])}; const c=document.getElementById('waLinks'); const input=document.getElementById('waText');
        function render(){
          c.innerHTML = phones.slice(0,50).map(p=>{ const url = 'https://wa.me/52'+p+'?text='+encodeURIComponent(input.value||''); return '<a class="btn" target="_blank" href="'+url+'">WhatsApp '+p+'</a>'; }).join('');
        }
        input.addEventListener('input',render); render();
      })();
    </script>`;
  }

  async function Games({session}){
    if(!session) return `<div class="card alert error">Debes iniciar sesión.</div>`;
    const me = await client.from('team_members').select('role').maybeSingle();
    const role = me.data?.role || null;
    const admin = role && ['admin','coach','coordinadora','treasurer'].includes(role);
    const {data:games,error}=await client.from('games').select('*').order('game_time',{ascending:true});
    if(error) return `<div class="card alert error">Error: ${esc(error.message)}</div>`;
    const cards = (games||[]).map(g=>`<div class="player-card">
        <img src="${esc(g.opponent_logo_url||'https://placehold.co/400x200?text=Logo')}" alt="Logo rival">
        <div class="pc-body"><b>${esc(g.opponent)}</b>
          <div class="small muted">${new Date(g.game_time).toLocaleString()}</div>
          <div class="small">Lugar: <a href="${esc(g.location_url||'#')}" target="_blank">${esc(g.location||'')}</a></div>
        </div>
      </div>`).join('');
    const adminForm = admin ? `<hr/><h3>Crear juego</h3>
      <form id="gameForm">
        <label>Oponente</label><input id="opp" required />
        <label>Fecha/hora (ISO)</label><input id="when" placeholder="2025-11-20T15:00:00" required />
        <label>Lugar</label><input id="place" />
        <label>URL ubicación</label><input id="locurl" />
        <label>Logo rival (archivo)</label><input id="oppLogoFile" type="file" accept=".png,.jpg,.jpeg" />
        <button class="btn">Crear</button>
      </form><div id="gameMsg" class="small"></div>` : '';
    return `<div class="card"><h2>Calendario</h2><div class="grid">${cards||'<div class="alert">Sin juegos.</div>'}</div>${adminForm}</div>`;
  }
  function hookGames(){
    const f=document.getElementById('gameForm'); const msg=document.getElementById('gameMsg'); if(!f) return;
    f.onsubmit=async(e)=>{
      e.preventDefault();
      const opp=document.getElementById('opp').value.trim(), when=document.getElementById('when').value.trim(), place=document.getElementById('place').value.trim(), loc=document.getElementById('locurl').value.trim();
      const file=document.getElementById('oppLogoFile').files[0];
      let logoUrl=null;
      if(file){
        const path = `logo-${Date.now()}-${file.name}`;
        const up = await client.storage.from('game-logos').upload(path, file, { upsert:false });
        if(up.error){ msg.innerHTML='<div class="alert error">Error subiendo logo: '+esc(up.error.message)+'</div>'; return; }
        const signed = await client.storage.from('game-logos').createSignedUrl(path, 3600);
        logoUrl = signed.data?.signedUrl || null;
      }
      const ins=await client.from('games').insert({ opponent: opp, game_time: when, location: place, location_url: loc, opponent_logo_url: logoUrl });
      if(ins.error){ msg.innerHTML='<div class="alert error">Error: '+esc(ins.error.message)+'</div>'; return; }
      msg.innerHTML='<div class="alert success">Juego creado.</div>'; location.hash='#/games'; location.reload();
    };
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
})();
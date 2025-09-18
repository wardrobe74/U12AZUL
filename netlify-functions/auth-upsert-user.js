import fetch from 'node-fetch';
export default async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing email/password' });
  const url = process.env.SUPABASE_URL + '/auth/v1/admin/users';
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const q = new URL(process.env.SUPABASE_URL + '/auth/v1/admin/users'); q.searchParams.set('email', email);
    const found = await fetch(q.toString(), { headers:{ apikey: token, Authorization: 'Bearer '+token } });
    const j = await found.json(); let user = j?.users?.[0];
    if (!user) {
      const create = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', apikey: token, Authorization: 'Bearer '+token }, body: JSON.stringify({ email, password, email_confirm: true }) });
      const cj = await create.json(); if (!create.ok) return res.status(create.status).json(cj);
      return res.status(200).json({ ok:true, created:true, id: cj.id });
    } else {
      const upd = await fetch(url+'/'+user.id, { method:'PUT', headers:{ 'Content-Type':'application/json', apikey: token, Authorization: 'Bearer '+token }, body: JSON.stringify({ password }) });
      const uj = await upd.json(); if (!upd.ok) return res.status(upd.status).json(uj);
      return res.status(200).json({ ok:true, created:false, id: user.id });
    }
  } catch(err){ return res.status(500).json({ error: String(err) }); }
};
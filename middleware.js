// middleware.js — password gate for the whole site, on Vercel's free tier.
// Sits at the project root, next to package.json.

// Gate everything except build assets. Vite emits to /assets/, not Next's /_next/.
export const config = {
  matcher: ["/((?!assets/|favicon.ico|.*\\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};

const FORM = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Coach Lab</title>
<style>
 @import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;700&display=swap');
 body{font-family:Archivo,sans-serif;background:#F4F4F4;margin:0;display:flex;
      min-height:100vh;align-items:center;justify-content:center}
 .box{background:#fff;border:1px solid #DCDCDC;padding:40px;width:340px;position:relative;overflow:hidden}
 .slash{position:absolute;top:-30px;left:-40px;width:90px;height:160px;background:#7C1219;transform:skewX(-18deg)}
 h1{font-family:Anton,sans-serif;text-transform:uppercase;letter-spacing:.04em;font-size:30px;
    margin:0 0 6px;position:relative}
 p{color:#6E6E6E;font-size:13px;margin:0 0 22px;position:relative}
 input{width:100%;box-sizing:border-box;border:1px solid #DCDCDC;padding:11px;font-size:15px;
       margin-bottom:10px;font-family:inherit}
 button{width:100%;background:#C0202A;color:#fff;border:0;padding:12px;font-weight:700;
        text-transform:uppercase;letter-spacing:.06em;font-size:13px;cursor:pointer;font-family:inherit}
 .err{color:#C0202A;font-size:13px;margin-bottom:10px}
</style></head><body>
<div class="box"><div class="slash"></div>
 <h1>Coach Lab</h1><p>Enter the password to continue.</p>
 __ERR__
 <input id="pw" type="password" placeholder="Password" autofocus
        onkeydown="if(event.key==='Enter')go()">
 <button onclick="go()">Enter</button>
</div>
<script>
 function go(){
   document.cookie='cl_auth='+encodeURIComponent(document.getElementById('pw').value)+
                   ';path=/;max-age=86400;samesite=lax';
   location.reload();
 }
</script></body></html>`;

export default function middleware(req) {
  const password = process.env.APP_PASSWORD;
  if (!password) return; // not configured — let it through

  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)cl_auth=([^;]*)/);
  const given = match ? decodeURIComponent(match[1]) : null;

  if (given === password) return; // authenticated

  const html = FORM.replace("__ERR__", given ? '<p class="err">Wrong password.</p>' : "");
  return new Response(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

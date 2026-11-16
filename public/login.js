const f=document.getElementById('f'),msg=document.getElementById('msg'),b=document.getElementById('b');
f.onsubmit=async e=>{e.preventDefault();b.disabled=true;msg.textContent='';
try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Panel-Request':'1'},body:JSON.stringify({username:document.getElementById('u').value,password:document.getElementById('p').value})});
const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Giriş yapılamadı.');location.replace('/');}
catch(err){msg.textContent=err.message;document.getElementById('p').value='';b.disabled=false;}};

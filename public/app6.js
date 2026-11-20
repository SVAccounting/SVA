// Workspace and responsive navigation enhancement
(()=>{
const originalNav=nav, originalGo=go;
const key=()=>`prooblik:desktop:v2:${me?.id||me?.login||'guest'}:${company?.id||'none'}`;
const available=()=>MENU.flatMap(([,items])=>items).filter(([id])=>id!=='home'&&id!=='company'&&visibleTab(id));
const defaults=['entries','add','tpl','docs','osv','rep','r_customer','r_item'];
const read=()=>{try{const a=JSON.parse(localStorage.getItem(key())||'null');if(Array.isArray(a))return a.filter(x=>x&&typeof x.id==='string').slice(0,40)}catch{}return defaults.filter(id=>available().some(x=>x[0]===id)).map(id=>({id,size:'normal'}))};
const write=a=>localStorage.setItem(key(),JSON.stringify(a));
const label=id=>available().find(x=>x[0]===id)?.[1]||id;
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function desk(){
 const tiles=read().filter(x=>available().some(([id])=>id===x.id));
 $('#app').innerHTML=`<section class="desk"><div class="desk-head"><div><h2>Робочий стіл</h2><p class="mut">Швидкий доступ до ваших розділів</p></div><button class="btn" onclick="deskSettings()" aria-label="Налаштувати робочий стіл" title="Налаштувати робочий стіл">⚙</button></div><div class="tiles">${tiles.map((x,i)=>`<button class="tile ${x.size==='wide'?'wide':''}" onclick="go('${x.id}')"><span class="tile-icon">${safe(label(x.id).split(' ')[0])}</span><span>${safe(label(x.id))}</span></button>`).join('')}</div>${tiles.length?'':'<div class="card">Немає плиток. Натисніть ⚙, щоб додати потрібні розділи.</div>'}</section>`;
}
window.deskSettings=()=>{
 const chosen=read(),ids=new Set(chosen.map(x=>x.id));
 $('#app').innerHTML=`<section class="desk"><div class="desk-head"><h2>⚙ Налаштування робочого столу</h2><button class="btn" onclick="go('home')">Готово</button></div><p class="mut">Позначте розділи, змінюйте ширину та порядок плиток. Зміни зберігаються автоматично в цьому браузері.</p><div class="card"><div class="desk-options">${available().map(([id,name])=>{const ix=chosen.findIndex(x=>x.id===id),item=chosen[ix];return `<div class="desk-option"><label><input type="checkbox" ${ids.has(id)?'checked':''} onchange="deskToggle('${id}',this.checked)"> ${safe(name)}</label>${item?`<div class="desk-actions"><button class="btn" onclick="deskMove('${id}',-1)" title="Вгору" ${ix===0?'disabled':''}>↑</button><button class="btn" onclick="deskMove('${id}',1)" title="Вниз" ${ix===chosen.length-1?'disabled':''}>↓</button><button class="btn" onclick="deskSize('${id}')">${item.size==='wide'?'Широка':'Звичайна'}</button></div>`:''}</div>`}).join('')}</div></div><button class="btn" onclick="deskReset()">Відновити типові плитки</button></section>`;
};
window.deskToggle=(id,on)=>{const a=read().filter(x=>x.id!==id);if(on&&available().some(x=>x[0]===id))a.push({id,size:'normal'});write(a);deskSettings()};
window.deskMove=(id,delta)=>{const a=read(),i=a.findIndex(x=>x.id===id),j=i+delta;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];write(a);deskSettings()};
window.deskSize=id=>{const a=read(),x=a.find(x=>x.id===id);if(x)x.size=x.size==='wide'?'normal':'wide';write(a);deskSettings()};
window.deskReset=()=>{localStorage.removeItem(key());deskSettings()};
window.quickMenu=()=>{const el=document.querySelector('#quickpanel');if(el){el.remove();return}const choices=['add','tpl','pko','vko','bin','bout','rcpt','sale','inv','act'].filter(id=>available().some(x=>x[0]===id));document.querySelector('#nav').insertAdjacentHTML('afterbegin',`<div id="quickpanel" class="quickpanel"><strong>Швидкі операції</strong>${choices.length?choices.map(id=>`<button onclick="document.querySelector('#quickpanel')?.remove();go('${id}')">${safe(label(id))}</button>`).join(''):'<p class="mut">Немає доступних операцій</p>'}</div>`)};
nav=function(){originalNav();if(!me)return;const n=$('#nav');const top=n.querySelector('.navx');if(top){top.innerHTML='<b>Меню</b><div class="nav-buttons"><button class="btn" onclick="quickMenu()" title="Типові операції" aria-label="Швидкі операції">＋</button><button class="btn" onclick="toggleNav()" title="Згорнути меню" aria-label="Згорнути меню">❮</button></div>'}else n.insertAdjacentHTML('afterbegin','<div class="navx"><b>Меню</b><div class="nav-buttons"><button class="btn" onclick="quickMenu()">＋</button><button class="btn" onclick="toggleNav()">❮</button></div></div>');n.querySelectorAll('.ng').forEach(g=>{const h=g.querySelector('.nh');if(h){h.setAttribute('role','button');h.setAttribute('tabindex','0');h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();h.click()}}}})};
if(!MENU[0][1].some(x=>x[0]==='home'))MENU[0][1].unshift(['home','🏠 Робочий стіл']);
views.home=async()=>desk();
go=async function(t){if(t==='home'){tab='home';nav();if(isMob())closeNav();await views.home();window.scrollTo(0,0);return}return originalGo(t)};
const prevPick=window.pick;window.pick=async id=>{await prevPick(id);await go('home')};
const prevBoot=window.boot;window.boot=async()=>{await prevBoot();if(me&&company)await go('home')};
if(me&&company)queueMicrotask(()=>go('home'));
// Existing initial boot can already be running when this script loads.
})();

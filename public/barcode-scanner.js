/* Сканування штрихкодів номенклатури. Камера запускається лише з натискання користувача. */
let inventoryScanner = null;
let inventoryScannerBusy = false;
let inventoryScannerLastCode = '';
let inventoryScannerScriptPromise = null;
function loadInventoryScannerLibrary(){
  if(window.Html5Qrcode) return Promise.resolve();
  if(inventoryScannerScriptPromise) return inventoryScannerScriptPromise;
  inventoryScannerScriptPromise = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.async=true;
    script.onload=()=>window.Html5Qrcode?resolve():reject(Error('Бібліотека сканування не завантажилась'));
    script.onerror=()=>reject(Error('Не вдалося завантажити бібліотеку сканування. Перевірте інтернет.'));
    document.head.appendChild(script);
  }).catch(err=>{inventoryScannerScriptPromise=null;throw err});
  return inventoryScannerScriptPromise;
}
function inventoryScanMessage(message, isError=false){
  const el=document.getElementById('inventory_scan_status');
  if(el){el.textContent=message;el.style.color=isError?'#ad2c24':'var(--mut)'}
}
async function closeInventoryScanner(){
  if(inventoryScannerBusy)return;
  inventoryScannerBusy=true;
  const instance=inventoryScanner;inventoryScanner=null;
  if(instance){
    try{if(instance.isScanning)await instance.stop()}catch(e){console.warn('Не вдалося зупинити камеру',e)}
    try{await instance.clear()}catch(e){console.warn('Не вдалося очистити сканер',e)}
  }
  document.getElementById('inventory_barcode_modal')?.remove();
  inventoryScannerBusy=false;
}
async function inventoryBarcodeFound(decodedText){
  const code=String(decodedText||'').trim();
  if(!code||inventoryScannerLastCode===code)return;
  inventoryScannerLastCode=code;
  const input=document.getElementById('rf_barcode');
  if(!input){await closeInventoryScanner();return}
  input.value=code;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  const existing=typeof RL!=='undefined'&&RL.find(x=>Number(x.id)!==Number(RE)&&String(x.data?.barcode||'').trim()===code);
  await closeInventoryScanner();
  if(existing){
    const msg=document.getElementById('msg');
    if(msg)msg.textContent=`Цей штрихкод уже має товар «${existing.name}». Змініть код або відкрийте наявний товар.`;
  }
  input.focus();
}
async function scanInventoryBarcode(){
  if(inventoryScannerBusy||document.getElementById('inventory_barcode_modal'))return;
  if(!document.getElementById('rf_barcode'))return;
  inventoryScannerLastCode='';
  const overlay=document.createElement('div');overlay.id='inventory_barcode_modal';overlay.className='inventory-barcode-overlay';
  overlay.innerHTML=`<div class="inventory-barcode-dialog" role="dialog" aria-modal="true" aria-label="Сканування штрихкоду">
    <div class="inventory-barcode-header"><strong>Сканування штрихкоду</strong><button type="button" class="btn" onclick="closeInventoryScanner()" aria-label="Закрити">✕</button></div>
    <div id="inventory_barcode_reader"></div>
    <p id="inventory_scan_status" role="status">Запуск камери…</p>
    <div class="inventory-barcode-fallback"><label for="inventory_barcode_photo">Або сфотографуйте штрихкод:</label>
      <input id="inventory_barcode_photo" type="file" accept="image/*" capture="environment" onchange="scanInventoryBarcodePhoto(this)"></div>
    <p class="mut" style="margin:8px 0 0">Наведіть камеру на EAN-13, EAN-8, UPC, Code 128 або QR. Код підставиться у картку товару, але не збережеться автоматично.</p>
  </div>`;
  overlay.addEventListener('click',ev=>{if(ev.target===overlay)closeInventoryScanner()});
  document.body.appendChild(overlay);
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){inventoryScanMessage('Камера в браузері потребує HTTPS та дозволу доступу. Можна спробувати фото нижче.',true);return}
  try{
    await loadInventoryScannerLibrary();
    if(!document.getElementById('inventory_barcode_modal'))return;
    const formats=window.Html5QrcodeSupportedFormats;
    const supported=['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','ITF','QR_CODE'].map(k=>formats?.[k]).filter(x=>x!==undefined);
    const options={verbose:false};if(supported.length)options.formatsToSupport=supported;
    inventoryScanner=new Html5Qrcode('inventory_barcode_reader',options);
    await inventoryScanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>({width:Math.min(w-24,300),height:Math.min(h-24,180)})},inventoryBarcodeFound,()=>{});
    inventoryScanMessage('Камера активна. Розташуйте штрихкод у рамці.');
  }catch(err){inventoryScanMessage(`Камеру не відкрито: ${err?.message||err}. Дозвольте доступ або скористайтеся фото.`,true)}
}
async function scanInventoryBarcodePhoto(input){
  const file=input.files?.[0];if(!file)return;
  try{
    await loadInventoryScannerLibrary();
    inventoryScanMessage('Розпізнавання фото…');
    if(inventoryScanner?.isScanning){await inventoryScanner.stop()}
    if(inventoryScanner){try{await inventoryScanner.clear()}catch(e){}inventoryScanner=null}
    if(!document.getElementById('inventory_barcode_modal'))return;
    inventoryScanner=new Html5Qrcode('inventory_barcode_reader',{verbose:false});
    const result=await inventoryScanner.scanFile(file,true);
    await inventoryBarcodeFound(result);
  }catch(err){inventoryScanMessage('Не вдалося розпізнати код на фото. Спробуйте чіткіше зображення або введіть код вручну.',true)}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('inventory_barcode_modal'))closeInventoryScanner()});

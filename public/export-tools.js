// Accessible Excel & PDF exporting: keeps table columns, borders and Ukrainian glyphs.
// Uses browser-only CDN libraries. Does not send document data to a third-party API.
(function(){
 const libs={
  excel:['https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js','https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'],
  pdf:['https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.20/pdfmake.min.js','https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js'],
  fonts:['https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/vfs_fonts.js','https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.20/vfs_fonts.js']
 };
 const loaded=new Map();
 const ensure=(kind,test)=>{
  if(test())return Promise.resolve();if(loaded.has(kind))return loaded.get(kind);
  const p=(async()=>{let last;for(const url of libs[kind]){
   try{await new Promise((resolve,reject)=>{const x=document.createElement('script');x.src=url;x.onload=resolve;x.onerror=()=>reject(new Error('Недоступна бібліотека '+kind));document.head.appendChild(x)});if(test()||kind==='fonts')return;}catch(e){last=e}
  }throw last||Error('Не завантажено '+kind);})();loaded.set(kind,p);return p;
 };
 const dataText=c=>String(c?.textContent||'').replace(/\u00a0|\u202f/g,' ').replace(/\s+/g,' ').trim();
 const numeric=(v)=>{
  const x=v.replace(/[\s\u00a0]/g,'');
  if(!x||!/^\(?-?\d+(?:[.,]\d+)?\)?$/.test(x)||/^0\d/.test(x))return v;
  let neg=x.startsWith('('),y=x.replace(/[()]/g,'').replace(',','.');let val=Number(y);
  return Number.isFinite(val)?(neg?-val:val):v;
 };
 const grid=(table)=>{
  const rows=[],merges=[];
  [...table.rows].forEach((tr,ri)=>{
   const row=rows[ri]||(rows[ri]=[]);let ci=0;
   [...tr.cells].forEach(cell=>{
    while(row[ci]!==undefined)ci++;
    const cs=Math.max(1,Number(cell.colSpan)||1),rs=Math.max(1,Number(cell.rowSpan)||1);
    for(let y=0;y<rs;y++){
     const target=rows[ri+y]||(rows[ri+y]=[]);
     for(let x=0;x<cs;x++)target[ci+x]=y===0&&x===0?numeric(dataText(cell)):'';
    }
    if(cs>1||rs>1)merges.push({r1:ri,c1:ci,r2:ri+rs-1,c2:ci+cs-1});
    ci+=cs;
   });
  });
  const n=Math.max(...rows.map(r=>r.length),1);
  return {rows:rows.map(r=>Array.from({length:n},(_,i)=>r[i]??'')),merges};
 };
 const descriptor=(root,financial=false)=>{
  const forms=financial?[...root.querySelectorAll('.financial-form')]:[];
  if(forms.length){return forms.flatMap((form,fi)=>{
   const title=dataText(form.querySelector('h3'))||'Фінансова звітність';
   const meta=[...form.querySelectorAll('.financial-meta>div')].map(dataText).filter(Boolean);
   return [...form.querySelectorAll('.financial-table')].map((t,i)=>({title:title+(fi===0?(i===0?' — Актив':' — Пасив'):' — Форма 2'),meta,...grid(t),label:fi===0?(i===0?'Актив':'Пасив'):'Форма 2',financial:true}));
  });}
  return [...root.querySelectorAll('table')].filter(t=>!t.closest('.noprint')).map((t,i)=>({title:dataText(t.closest('.card')?.querySelector('h3')||root.querySelector('h3'))||'Звіт '+(i+1),meta:[],...grid(t),label:'Звіт '+(i+1),financial:false}));
 };
 const colWidths=(rows,isFin)=>{
  const n=Math.max(...rows.map(r=>r.length),1);
  if(isFin&&n===4)return [68,14,23,23];
  return Array.from({length:n},(_,i)=>Math.min(50,Math.max(13,Math.min(38,Math.ceil(Math.max(...rows.slice(0,100).map(r=>String(r[i]??'').length),10)*0.72)))));
 };
 function filename(name,ext){return `ProOblik_${String(name||'звіт').replace(/[^\wа-яіїєґ-]+/gi,'_')}_${new Date().toISOString().slice(0,10)}.${ext}`;}
 async function exportExcel(root,name,financial){
  await ensure('excel',()=>!!window.ExcelJS);
  const blocks=descriptor(root,financial);if(!blocks.length)throw Error('Немає таблиць для експорту');
  const book=new ExcelJS.Workbook();book.creator='ProOblik';book.created=new Date();
  const used=new Set();for(const b of blocks){
   let label=b.label.replace(/[\\/?*\[\]:]/g,'').slice(0,25),candidate=label,i=1;
   while(used.has(candidate))candidate=`${label.slice(0,22)}_${++i}`;used.add(candidate);
   const sheet=book.addWorksheet(candidate,{views:[{state:'frozen',ySplit:b.meta.length+3}],pageSetup:{paperSize:9,orientation:b.financial?'portrait':b.rows[0]?.length>5?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.3,right:.3,top:.4,bottom:.4,header:.18,footer:.18}}});
   const n=Math.max(...b.rows.map(r=>r.length),4);
   const widths=colWidths(b.rows,b.financial);for(let col=1;col<=n;col++)sheet.getColumn(col).width=widths[col-1]||18;
   const titleRow=sheet.addRow([b.title]);sheet.mergeCells(1,1,1,n);titleRow.height=29;
   titleRow.getCell(1).font={name:'Arial',size:14,bold:true,color:{argb:'FF24374B'}};
   titleRow.getCell(1).alignment={vertical:'middle',horizontal:'center',wrapText:true};
   for(const m of b.meta){const r=sheet.addRow([m]);sheet.mergeCells(r.number,1,r.number,n);r.height=22;r.getCell(1).font={name:'Arial',size:10};r.getCell(1).alignment={vertical:'middle',wrapText:true}}
   sheet.addRow([' ']);const tableStart=sheet.rowCount+1;
   for(const [index,raw] of b.rows.entries()){
    const values=Array.from({length:n},(_,i)=>raw[i]??'');const r=sheet.addRow(values);
    const head=index===0||index===1&&b.financial;const group=values.slice(1).every(x=>x===''||x==null)&&typeof values[0]==='string';
    for(let c=1;c<=n;c++){
     const cell=r.getCell(c);cell.font={name:'Arial',size:10,bold:head||group,color:{argb:'FF24313B'}};
     cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:head?'FFE9EFEF':group?'FFF5F5F0':index%2?'FFFFFFFF':'FFFAFAF7'}};
     cell.border={top:{style:'thin',color:{argb:'FFA8B0B5'}},bottom:{style:'thin',color:{argb:'FFA8B0B5'}},left:{style:'thin',color:{argb:'FFA8B0B5'}},right:{style:'thin',color:{argb:'FFA8B0B5'}}};
     cell.alignment={vertical:'middle',horizontal:typeof cell.value==='number'?'right':c>1&&b.financial?'center':'left',wrapText:true};
     if(typeof cell.value==='number')cell.numFmt=b.financial?'#,##0;[Red](#,##0);"-"':'#,##0.00;[Red](#,##0.00);"-"';
    }
    const maxLen=Math.max(...values.map((v,i)=>String(v??'').length/(widths[i]||18)));
    r.height=Math.min(130,Math.max(22,Math.ceil(maxLen)*15));
    if(group&&n>1&&!b.merges?.some(m=>m.r1===index&&m.c1===0)){sheet.mergeCells(r.number,1,r.number,n);r.getCell(1).alignment={wrapText:true,vertical:'middle'}}
   }
   for(const m of b.merges||[])sheet.mergeCells(tableStart+m.r1,1+m.c1,tableStart+m.r2,1+m.c2);
   sheet.pageSetup.printTitlesRow=`${tableStart}:${tableStart+(b.financial?1:0)}`;
   sheet.headerFooter.oddFooter='ProOblik · &P / &N';
  }
  const buffer=await book.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=filename(name,'xlsx');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
 }
 async function exportPdf(root,name,financial){
  const blocks=descriptor(root,financial);if(!blocks.length)throw Error('Немає таблиць для PDF');
  try{
   await ensure('pdf',()=>!!window.pdfMake);await ensure('fonts',()=>!!window.pdfMake?.vfs && Object.keys(window.pdfMake.vfs).length>0);
   const contents=[];
   for(const [ix,b] of blocks.entries()){
    if(ix&&financial&&b.label==='Форма 2')contents.push({text:'',pageBreak:'before'});
    if(!(financial&&b.label==='Пасив'))contents.push({text:b.title,style:'title',margin:[0,ix===0?0:12,0,8]});
    if(b.meta.length&&!(financial&&b.label==='Пасив'))contents.push({stack:b.meta.map(x=>({text:x,fontSize:8,margin:[0,0,0,2]})),margin:[0,0,0,9]});
    const numCols=Math.max(...b.rows.map(r=>r.length));const headers=b.financial?2:1;
    const body=b.rows.map((row,i)=>Array.from({length:numCols},(_,c)=>{
     const v=row[c]??'';return{text:String(v),fontSize:b.financial?7.4:8,bold:i<headers||(c===0&&row.slice(1).every(x=>x===''||x==null)),alignment:typeof v==='number'?'right':c===1&&b.financial?'center':'left',fillColor:i<headers?'#F0F2F0':i%2?'#FFFFFF':'#FAFAF8',margin:[2,3,2,3]};
    }));
    for(const m of b.merges||[]){const cell=body[m.r1]?.[m.c1];if(!cell)continue;if(m.c2>m.c1)cell.colSpan=m.c2-m.c1+1;if(m.r2>m.r1)cell.rowSpan=m.r2-m.r1+1;for(let r=m.r1;r<=m.r2;r++)for(let c=m.c1;c<=m.c2;c++)if(r!==m.r1||c!==m.c1)body[r][c]={};}
    contents.push({table:{headerRows:headers,keepWithHeaderRows:1,widths:b.financial?['*',56,82,82]:Array.from({length:numCols},(_,c)=>c===0?Math.min(190,Math.max(95,340-numCols*14)):'*'),body},layout:{hLineColor:()=> '#999999',vLineColor:()=> '#999999',hLineWidth:()=>.4,vLineWidth:()=>.4},margin:[0,0,0,10]});
   }
   const doc={pageSize:'A4',pageOrientation:financial?'portrait':Math.max(...blocks.map(x=>x.rows[0]?.length||0))>5?'landscape':'portrait',pageMargins:[28,30,28,32],content:contents,defaultStyle:{font:'Roboto',fontSize:9},styles:{title:{fontSize:13,bold:true,alignment:'center'}},footer:(page,pages)=>({text:`ProOblik · ${page} / ${pages}`,alignment:'right',fontSize:7,margin:[0,5,28,0]})};
   const p=pdfMake.createPdf(doc);p.download(filename(name,'pdf'));
   return 'pdf';
  }catch(err){
   // Reliable fallback, independent of canvas, fonts fetched by PDF library and browser addons.
   printOnly(root,financial);
   return 'print';
  }
 }
 function printOnly(root,financial){
  const w=window.open('','_blank');if(!w)throw Error('Дозвольте відкриття вікна друку (PDF)');
  const clone=root.cloneNode(true);clone.querySelectorAll('.noprint,button,input,select,textarea,.tb').forEach(el=>el.remove());
  const style=`@page{size:A4 ${financial?'portrait':'landscape'};margin:9mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#20262a;font-size:9pt;margin:0}.financial-form{margin:0 0 18px;break-inside:auto}.financial-form+.financial-form{break-before:page}.financial-meta{font-size:8pt;margin:0 0 10px}.financial-meta>div{padding:2px 0;border-bottom:1px solid #ddd}h3{text-align:center;font-size:13pt}table{width:100%!important;max-width:100%!important;border-collapse:collapse;table-layout:fixed;font-size:8pt}th,td{border:1px solid #888;padding:3px 5px;white-space:normal!important;word-break:break-word;overflow-wrap:anywhere;vertical-align:top}td.n,th.n{text-align:right}.financial-table col:nth-child(1){width:52%!important}.financial-table col:nth-child(2){width:10%!important}.financial-table col:nth-child(3),.financial-table col:nth-child(4){width:19%!important}thead{display:table-header-group}tr{break-inside:avoid}.card{box-shadow:none;border:0;padding:0}p,div{max-width:100%}`;
  w.document.open();w.document.write('<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>ProOblik — Друк / PDF</title><style>'+style+'</style></head><body>'+clone.innerHTML+'</body></html>');w.document.close();
  let sent=false;const call=()=>{if(sent)return;sent=true;w.focus();w.print()};w.onload=call;setTimeout(call,500);
 }
 window.ProExport={exportExcel,exportPdf,printOnly};
})();

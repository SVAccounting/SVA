// ProOblik: експорт у PDF / Excel та друк. Підключається ПІСЛЯ app5.js і app9.js і замінює їхні функції.
// PDF — справжній векторний (jsPDF + autoTable, шрифт Liberation Sans з кирилицею), без html2canvas, тому
// немає помилок «Cannot read properties of undefined (reading 'toString')» і таблиця завжди вміщується на A4.
// Excel — ExcelJS: рамки комірок, ширини стовпців за вмістом, перенесення тексту, числові формати, друк «по ширині».
(function(){
  const V='vendor/',FV='?v=20261121';
  const loadScript=(src,ready)=>ready()?Promise.resolve():new Promise((ok,no)=>{
    const s=document.createElement('script');s.src=src+FV;s.onload=ok;
    s.onerror=()=>no(new Error('Не вдалося завантажити бібліотеку експорту ('+src+'). Перевірте з’єднання та оновіть сторінку (Ctrl+F5).'));
    document.head.appendChild(s)});
  const SKIP='.noprint,.tb,button,select,input,textarea,label,script,style,.spin,.toast';
  const BLOCK=/^(DIV|P|H[1-6]|TABLE|UL|OL|SECTION|ARTICLE|FORM|HEADER|FOOTER|MAIN)$/;
  const clean=s=>String(s||'').replace(/[\u00a0\u202f]/g,' ').replace(/\u2611/g,'[x]').replace(/\u2610/g,'[ ]').replace(/[ \t]+/g,' ').replace(/ ?\n ?/g,'\n').trim();
  const nowStr=()=>new Date().toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const dmy=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.split('-').reverse().join('.'):s;
  const coName=()=>(typeof company!=='undefined'&&company&&company.name)||'';

  // ---------- розбір DOM у «блоки»: text / table / break / sec ----------
  function textOf(el){const c=el.cloneNode(true);c.querySelectorAll(SKIP).forEach(x=>x.remove());
    // <br> → перенос рядка
    c.querySelectorAll('br').forEach(b=>b.replaceWith('\n'));return clean(c.textContent)}
  function walk(node,out,ctx){
    for(const el of node.children){
      if(el.matches&&el.matches(SKIP))continue;
      if(el.matches('.card,.financial-form'))out.push({t:'sec',el});
      if(el.matches('.financial-form')&&ctx.forms++>0)out.push({t:'break'});
      if(el.tagName==='TABLE'){out.push({t:'table',el});continue}
      if([...el.children].some(c=>BLOCK.test(c.tagName)||c.tagName==='TABLE')){walk(el,out,ctx);continue}
      const t=textOf(el);if(!t)continue;
      const h=/^H([1-4])$/.test(el.tagName)?+el.tagName[1]:0;
      out.push({t:'text',text:t,h,center:!!el.closest('.financial-form-heading'),right:el.classList.contains('financial-meta-title'),small:!!el.closest('.financial-meta,.financial-signatures')});
    }
  }
  function collect(root){
    const out=[],ctx={forms:0};
    if(root.matches&&root.matches('.card,.financial-form,.pdoc'))out.push({t:'sec',el:root});
    walk(root,out,ctx);
    // період, якщо на екрані є поля «з/по» (ОСВ, картка рахунка тощо)
    const f=document.querySelector('#f'),t=document.querySelector('#t');
    if(f&&t&&f.value&&t.value&&!root.querySelector('.financial-form')){
      const i=out.findIndex(b=>b.t==='text'&&b.h);const p={t:'text',text:`Період: з ${dmy(f.value)} по ${dmy(t.value)}`,h:0};
      out.splice(i>=0?i+1:0,0,p);
    }
    return out;
  }
  const colCount=tb=>Math.max(1,...[...tb.rows].map(r=>[...r.cells].reduce((s,c)=>s+(c.colSpan||1),0)));
  const isFin=root=>!!(root.querySelector&&root.querySelector('.financial-form'));
  const wide=blocks=>Math.max(0,...blocks.filter(b=>b.t==='table').map(b=>colCount(b.el)))>=7;
  const wantLand=(root,blocks,land)=>isFin(root)?false:(land??((typeof LAND!=='undefined'&&LAND.includes(tab))||wide(blocks)));

  // ---------- PDF ----------
  let FONTS=null;
  async function loadFonts(){
    if(FONTS)return FONTS;
    const get=async f=>{const r=await fetch('fonts/'+f+FV);if(!r.ok)throw new Error('Не знайдено шрифт '+f);
      const b=new Uint8Array(await r.arrayBuffer());let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)};
    FONTS={r:await get('LiberationSans-Regular.ttf'),b:await get('LiberationSans-Bold.ttf')};return FONTS;
  }
  window.exPdf=async function(root,name,land){
    root=root||document.querySelector('#app');
    const tip=toast('Формується PDF…','wait');
    try{
      await loadScript(V+'jspdf.umd.min.js',()=>window.jspdf&&window.jspdf.jsPDF);
      await loadScript(V+'jspdf.plugin.autotable.min.js',()=>window.jspdf.jsPDF.API.autoTable);
      const fonts=await loadFonts();
      const blocks=collect(root);if(!blocks.some(b=>b.t==='table'))throw new Error('Немає даних для експорту — спочатку сформуйте звіт');
      const landscape=wantLand(root,blocks,land),fin=isFin(root);
      const {jsPDF}=window.jspdf;
      const doc=new jsPDF({orientation:landscape?'l':'p',unit:'mm',format:'a4',compress:true});
      doc.addFileToVFS('LS-Regular.ttf',fonts.r);doc.addFont('LS-Regular.ttf','LS','normal');
      doc.addFileToVFS('LS-Bold.ttf',fonts.b);doc.addFont('LS-Bold.ttf','LS','bold');
      const PW=doc.internal.pageSize.getWidth(),PH=doc.internal.pageSize.getHeight();
      const M={left:10,right:10,top:12,bottom:14},W=PW-M.left-M.right;
      let y=M.top;
      const room=h=>{if(y+h>PH-M.bottom){doc.addPage();y=M.top}};
      for(const b of blocks){
        if(b.t==='break'){doc.addPage();y=M.top;continue}
        if(b.t==='text'){
          const pt=b.h===3?12:b.h===1||b.h===2?14:b.h?10.5:b.small?8:9,bold=!!b.h||b.right;
          if(b.center)y+=3;
          doc.setFont('LS',bold?'bold':'normal');doc.setFontSize(pt);doc.setTextColor(20);
          const lines=doc.splitTextToSize(b.text,W),lh=pt*0.3528*1.28;room(lines.length*lh+1);
          const x=b.center?PW/2:b.right?PW-M.right:M.left,al=b.center?'center':b.right?'right':'left';
          lines.forEach((ln,i)=>doc.text(ln,x,y+pt*0.3528+i*lh,{align:al}));
          y+=lines.length*lh+(b.h?2:b.small?0.6:1.2);continue;
        }
        if(b.t!=='table')continue;
        const tb=b.el,cols=colCount(tb);
        const fs=fin?8:cols>=9?7:cols>=7?7.8:8.8;
        const columnStyles={};
        const cg=[...tb.querySelectorAll('colgroup col')].map(c=>parseFloat(c.style.width));
        if(cg.length&&cg.every(x=>x>0)){const tot=cg.reduce((a,c)=>a+c,0);cg.forEach((p,i)=>columnStyles[i]={cellWidth:W*p/tot})}
        room(20);
        doc.autoTable({
          html:tb,startY:y,margin:{left:M.left,right:M.right,top:M.top,bottom:M.bottom},theme:'grid',
          tableWidth:fin||Object.keys(columnStyles).length?W:'auto',
          styles:{font:'LS',fontSize:fs,cellPadding:{top:1.1,bottom:1.1,left:1.4,right:1.4},lineColor:[85,85,85],lineWidth:0.15,textColor:20,overflow:'linebreak',valign:'middle',minCellHeight:0},
          headStyles:{fillColor:[236,236,230],textColor:20,fontStyle:'bold',halign:'center'},
          footStyles:{fillColor:[236,236,230],textColor:20,fontStyle:'bold'},
          columnStyles,rowPageBreak:'avoid',showHead:'everyPage',showFoot:'lastPage',
          didParseCell(d){
            const el=d.cell.raw;if(!el||el.nodeType!==1)return;
            d.cell.text=d.cell.text.map(s=>clean(s).replace(/\n/g,' ').trim());
            const cs=getComputedStyle(el);
            if(d.section!=='head'){
              const ta=cs.textAlign;d.cell.styles.halign=ta==='right'||ta==='end'?'right':ta==='center'?'center':'left';
              if(parseInt(cs.fontWeight,10)>=600)d.cell.styles.fontStyle='bold';
              const pl=parseFloat(el.style.paddingLeft);if(pl>0)d.cell.styles.cellPadding={top:1.1,bottom:1.1,right:1.4,left:1.4+Math.max(0,pl-8)*0.2646};
              if((el.colSpan||1)>=3){d.cell.styles.fillColor=[243,243,238];d.cell.styles.fontStyle='bold'}
              if(el.classList.contains('n'))d.cell.styles.halign='right';
            }
          },
        });
        y=doc.lastAutoTable.finalY+4;
      }
      const n=doc.getNumberOfPages();
      for(let i=1;i<=n;i++){doc.setPage(i);doc.setFont('LS','normal');doc.setFontSize(7.5);doc.setTextColor(110);
        doc.text(`ProOblik${coName()?' · '+coName():''} · сформовано ${nowStr()}`,M.left,PH-6);
        doc.text(`Сторінка ${i} з ${n}`,PW-M.right,PH-6,{align:'right'})}
      doc.save(fname(name,'pdf'));tip.done('PDF збережено','ok');
    }catch(e){console.error(e);tip.done('Не вдалося створити PDF: '+e.message,'err')}
  };
  window.exportFinancialPdf=src=>window.exPdf(src);

  // ---------- Excel ----------
  const NUM_A=/^\(?[-−]?\d{1,3}(?: \d{3})+(?:[.,]\d+)?\)?$/,NUM_B=/^\(?[-−]?\d+(?:[.,]\d+)?\)?$/;
  function parseNum(raw,dashZero){
    const t=clean(raw);if(!t)return null;
    if(dashZero&&(t==='–'||t==='—'))return{v:0,dec:0,grp:true,paren:true};
    if(!(NUM_A.test(t)||NUM_B.test(t)))return null;
    const core=t.replace(/[()]/g,'').replace('−','-');
    if(/^-?0\d/.test(core)||core.replace(/\D/g,'').length>12)return null; // «0012», штрихкоди — лишаємо текстом
    const neg=/^\(.*\)$/.test(t)||core.startsWith('-');
    const dm=core.match(/[.,](\d+)$/);const v=Number(core.replace(/[ -]/g,'').replace(',','.'))*(neg?-1:1);
    return{v,dec:dm?dm[1].length:0,grp:/ /.test(core),paren:/^\(/.test(t)};
  }
  const THIN={style:'thin',color:{argb:'FF666666'}},BORDER={top:THIN,left:THIN,bottom:THIN,right:THIN};
  const argbFill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
  function tableModel(tb,fin){
    const occ=[],cells=[];let headRows=0;
    [...tb.rows].forEach((tr,r)=>{
      occ[r]=occ[r]||[];let c=0;
      if(tr.parentElement.tagName==='THEAD')headRows=r+1;
      [...tr.cells].forEach(td=>{
        while(occ[r][c])c++;
        const cs=td.colSpan||1,rs=td.rowSpan||1;
        for(let i=0;i<rs;i++)for(let j=0;j<cs;j++){(occ[r+i]=occ[r+i]||[])[c+j]=true}
        const st=getComputedStyle(td),text=clean(td.innerText!==undefined?td.innerText:td.textContent);
        const inHead=tr.parentElement.tagName==='THEAD',inFoot=tr.parentElement.tagName==='TFOOT';
        const num=inHead||(fin&&c<2)?null:parseNum(text,fin&&c>=2);
        const ta=st.textAlign;
        cells.push({r,c,cs,rs,text,num,head:inHead,foot:inFoot,
          bold:inHead||inFoot||parseInt(st.fontWeight,10)>=600,
          align:inHead?'center':num?'right':(ta==='right'||ta==='end')?'right':ta==='center'?'center':'left',
          indent:Math.max(0,Math.round((parseFloat(td.style.paddingLeft)-8)/8))||0,
          band:!inHead&&cs>=3});
        c+=cs;
      });
    });
    return{cells,rows:tb.rows.length,cols:Math.max(1,...occ.map(o=>o.length)),headRows};
  }
  const sheetName=(wb,s)=>{let n=(s||'Звіт').replace(/[\\\/?*\[\]:]/g,' ').replace(/\s+/g,' ').trim().slice(0,28)||'Звіт',k=n,i=2;
    while(wb.getWorksheet(k))k=n.slice(0,28-String(i).length-1)+' '+(i++);return k};
  function sections(blocks){
    const secs=[];let cur=null,pending=[];
    for(const b of blocks){
      if(b.t==='sec'){cur={items:[...pending],tables:0};pending=[];secs.push(cur);continue}
      if(b.t==='break')continue;
      if(!cur){cur={items:[],tables:0};secs.push(cur)}
      cur.items.push(b);if(b.t==='table')cur.tables++;
    }
    const res=[];let carry=[];
    for(const s of secs){
      if(!s.tables){carry.push(...s.items.filter(x=>x.t==='text'));continue}
      res.push({items:[...carry,...s.items]});carry=[];
    }
    return res.length?res:[{items:blocks.filter(b=>b.t!=='sec'&&b.t!=='break')}];
  }
  window.exXlsx=async function(root,name,land){
    root=root||document.querySelector('#app');
    const tip=toast('Формується Excel…','wait');
    try{
      await loadScript(V+'exceljs.min.js',()=>window.ExcelJS);
      const blocks=collect(root);if(!blocks.some(b=>b.t==='table'))throw new Error('Немає даних для експорту — спочатку сформуйте звіт');
      const fin=isFin(root),landscape=wantLand(root,blocks,land);
      const wb=new ExcelJS.Workbook();wb.creator='ProOblik';wb.created=new Date();
      for(const sec of sections(blocks)){
        const fm=sec.items.map(x=>x.text||'').join('\n').match(/Форма №(\d)/);
        const title=fm?`Форма №${fm[1]}${fm[1]==='1'?' Баланс':fm[1]==='2'?' Фінрезультати':''}`:(sec.items.find(x=>x.t==='text'&&x.h)||sec.items.find(x=>x.t==='text')||{}).text;
        const ws=wb.addWorksheet(sheetName(wb,title),{views:[{showGridLines:false}]});
        const models=sec.items.map(it=>it.t==='table'?{...it,m:tableModel(it.el,fin)}:it);
        const NC=Math.max(2,...models.filter(x=>x.m).map(x=>x.m.cols));
        // ширини стовпців за вмістом
        const wd=Array(NC).fill(0);
        models.filter(x=>x.m).forEach(x=>x.m.cells.forEach(k=>{if(k.cs>1)return;
          const longest=Math.max(0,...String(k.text).split('\n').map(s=>s.length));
          const len=k.head?Math.min(longest,16)+2:k.num?Math.max(longest,k.num.dec?String(Math.abs(k.num.v).toFixed(k.num.dec)).length+3:longest)+2:Math.min(longest,70)*1.05+2;
          wd[k.c]=Math.max(wd[k.c],len)}));
        const cap=(c,w)=>Math.max(7,Math.min(w||8,c===0?62:34));
        wd.forEach((w,c)=>{ws.getColumn(c+1).width=cap(c,w)});
        const widthOf=(c,cs)=>{let s=0;for(let i=0;i<cs;i++)s+=ws.getColumn(c+1+i).width||8;return s};
        const mergeRow=(r,text,o={})=>{ws.mergeCells(r,1,r,NC);const cell=ws.getCell(r,1);cell.value=text;
          cell.font={name:'Arial',size:o.size||10,bold:!!o.bold,color:{argb:'FF000000'}};
          cell.alignment={vertical:'middle',horizontal:o.align||'left',wrapText:true};
          const w=widthOf(0,NC),lines=String(text).split('\n').reduce((s,l)=>s+Math.max(1,Math.ceil(l.length*(o.size>11?1.25:1.05)/w)),0);
          ws.getRow(r).height=Math.max(15,(o.size||10)*1.45*lines)};
        let r=1,firstHead=null;
        for(const it of models){
          if(it.t==='text'){mergeRow(r++,it.text,{bold:!!it.h||it.right,size:it.h===1||it.h===2?14:it.h?12:it.small?9:10,align:it.center?'center':it.right?'right':'left'});continue}
          if(it.m){
            const base=r,m=it.m;
            for(const k of m.cells){
              const r1=base+k.r,c1=k.c+1,r2=r1+k.rs-1,c2=c1+k.cs-1;
              if(k.rs>1||k.cs>1)ws.mergeCells(r1,c1,r2,c2);
              for(let rr=r1;rr<=r2;rr++)for(let cc=c1;cc<=c2;cc++){const x=ws.getCell(rr,cc);x.border=BORDER;if(k.head||k.foot)x.fill=argbFill('FFE9E9E1');else if(k.band)x.fill=argbFill('FFF3F3EE')}
              const cell=ws.getCell(r1,c1);
              if(k.num){cell.value=k.num.v;
                const d=k.num.dec?'.'+'0'.repeat(k.num.dec):'';
                cell.numFmt=fin?`#,##0${d};(#,##0${d});"–"`:(k.num.grp||k.num.dec?`#,##0${d};-#,##0${d}`:'0');
              }else cell.value=k.text===''?null:k.text;
              cell.font={name:'Arial',size:10,bold:k.bold,color:{argb:'FF000000'}};
              cell.alignment={vertical:'middle',horizontal:k.align,wrapText:true,indent:k.align==='left'?k.indent:k.num?1:0};
            }
            // висота рядків: враховуємо перенесення тексту
            const need={};
            m.cells.forEach(k=>{if(k.rs>1)return;const w=widthOf(k.c,k.cs)-1;
              const lines=String(k.text).split('\n').reduce((s,l)=>s+Math.max(1,Math.ceil((l.length+k.indent*2)*(k.head?1.5:k.bold?1.2:0.92)/Math.max(w,4))),0);
              need[k.r]=Math.max(need[k.r]||1,lines)});
            for(let i=0;i<m.rows;i++){const L=need[i]||1;ws.getRow(base+i).height=Math.max(16,13.6*L+4)}
            if(firstHead===null&&m.headRows)firstHead={from:base,to:base+m.headRows-1};
            r=base+m.rows+1; // порожній рядок між таблицями
          }
        }
        ws.pageSetup={paperSize:9,orientation:landscape?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,
          margins:{left:.4,right:.4,top:.5,bottom:.6,header:.25,footer:.3},horizontalCentered:true};
        ws.headerFooter={oddFooter:'&L&8ProOblik&R&8Сторінка &P з &N'};
        if(!fin&&firstHead&&firstHead.from<=6){ws.views=[{showGridLines:false,state:'frozen',ySplit:firstHead.to}];ws.pageSetup.printTitlesRow=`${firstHead.from}:${firstHead.to}`}
      }
      const buf=await wb.xlsx.writeBuffer();
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      a.download=fname(name,'xlsx');document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
      tip.done('Файл Excel збережено','ok');
    }catch(e){console.error(e);tip.done('Не вдалося створити Excel: '+e.message,'err')}
  };
  window.exportFinancialXlsx=src=>window.exXlsx(src);

  // ---------- Друк ----------
  function setPage(orient){let s=document.getElementById('printpage');if(!s){s=document.createElement('style');s.id='printpage';document.head.appendChild(s)}
    s.textContent=`@page{size:A4 ${orient};margin:10mm}`}
  function autoOrientation(){
    const root=document.querySelector('body.printing #prn .pdoc')||document.querySelector('#app');if(!root)return;
    const blocks=[];walk(root,blocks,{forms:0});
    setPage(wantLand(root,blocks)?'landscape':'portrait');
  }
  window.addEventListener('beforeprint',autoOrientation);
  window.exPrint=function(){document.body.classList.remove('printing');autoOrientation();window.print()};
})();

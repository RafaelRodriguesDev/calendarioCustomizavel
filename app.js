/*
 * Ateliê de Calendários — Grace Fotografia
 * Aplicação local, sem serviços externos. Datas de calendário calculadas por UTC.
 * O mesmo renderizador Canvas produz a prévia, o PNG e o PDF de impressão.
 */
(() => {
  'use strict';
  const WIDTH = 1000, HEIGHT = 1414;
  const canvas = document.getElementById('poster');
  const context = canvas.getContext('2d', { alpha: false });
  const $ = id => document.getElementById(id);
  const THEMES = {
    classico: { red:'#80252c', green:'#214e3d', gold:'#c3a06b', paper:'#f9f0e1', ink:'#413931' },
    champagne:{ red:'#79553e', green:'#6e7252', gold:'#b99160', paper:'#fff3e5', ink:'#514238' },
    rose:     { red:'#aa5962', green:'#697d69', gold:'#c99a79', paper:'#fff1ed', ink:'#58484b' },
    inverno:  { red:'#4c6970', green:'#6b827c', gold:'#a9b9c4', paper:'#f2f6f8', ink:'#344a56' }
  };
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const WEEKDAYS = ['D','S','T','Q','Q','S','S'];
  const ELEMENTS = [
    ['foto','Fotografia — arrastar enquadramento'],
    ['ano','Moldura e número do ano'],
    ['calendario','Conjunto dos 12 meses'],
    ['ramo-esq','Ramo decorativo esquerdo'],
    ['ramo-dir','Ramo decorativo direito'],
    ['flor-esq','Arranjo inferior esquerdo'],
    ['flor-dir','Arranjo inferior direito']
  ];
  const clone = data => JSON.parse(JSON.stringify(data));
  const clamp = (v,a,b) => Math.min(Math.max(v,a),b);
  const isYearValid = y => Number.isInteger(y) && y >= 1900 && y <= 2100;
  const defaultItems = layout => layout === 'cima' ? {
    ano:{x:500,y:586,scale:1}, calendario:{x:500,y:986,scale:1},
    'ramo-esq':{x:141,y:555,scale:1},'ramo-dir':{x:859,y:555,scale:1},
    'flor-esq':{x:67,y:1358,scale:1},'flor-dir':{x:933,y:1358,scale:1}
  } : {
    ano:{x:500,y:93,scale:1},calendario:{x:500,y:487,scale:1},
    'ramo-esq':{x:141,y:840,scale:1},'ramo-dir':{x:859,y:840,scale:1},
    'flor-esq':{x:67,y:1345,scale:1},'flor-dir':{x:933,y:1345,scale:1}
  };
  const state = {
    year:2027, layout:'cima', theme:'classico', cols:4, weekStart:0, calendarScale:1,
    sunday:true, pine:true, ornaments:true, monthLines:true, plaque:true, signature:'', nameText:'',
    colors:clone(THEMES.classico), photo:{zoom:1,x:0,y:0}, photoData:null,
    items:defaultItems('cima'), selected:null,
    paper:'A4', dpi:300, custom:[]
  };
  let demoPhoto = new Image();
  let currentPhoto = demoPhoto;
  let photoLabel = 'Foto demonstrativa (substitua por uma foto do cliente)';
  let busy = false, dragging = null;
  let toastTimer;
  const customImages = new Map();

  function showToast(message, isError=false) {
    const el=$('toast');el.textContent=message;el.style.background=isError?'#803340':'#2c302d';
    el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);
  }
  function setStatus(txt){$('status').textContent=txt;}
  function photoBox(){return state.layout==='cima'?{x:0,y:0,w:WIDTH,h:555}:{x:0,y:845,w:WIDTH,h:569};}
  function hexToRgb(hex){return {r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)};}
  function rgba(hex,alpha=1){const c=hexToRgb(hex);return `rgba(${c.r},${c.g},${c.b},${alpha})`;}
  function blend(a,b,t){const c=hexToRgb(a),d=hexToRgb(b);return '#'+[c.r,c.g,c.b].map((v,i)=>Math.round(v*(1-t)+[d.r,d.g,d.b][i]*t).toString(16).padStart(2,'0')).join('');}
  function roundedPath(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function polygon(ctx,pts){ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
  function drawFullPaper(ctx){
    const g=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);
    g.addColorStop(0,blend(state.colors.paper,'#ffffff',.53));g.addColorStop(.44,state.colors.paper);
    g.addColorStop(1,blend(state.colors.paper,state.colors.gold,.10));ctx.fillStyle=g;ctx.fillRect(0,0,WIDTH,HEIGHT);
    // An airy paper texture; deterministic, so image and preview are identical.
    ctx.save();ctx.globalAlpha=.07;ctx.fillStyle=state.colors.gold;
    for(let i=0;i<400;i++) {const x=(i*6271%997), y=(i*3203%1411);ctx.fillRect(x,y,i%5===0?2:.9,.8);}
    ctx.restore();
  }
  function getPhotoMetrics(){
    const box=photoBox(),iw=currentPhoto&&currentPhoto.naturalWidth,ih=currentPhoto&&currentPhoto.naturalHeight;
    if(!iw||!ih)return null;
    const factor=Math.max(box.w/iw,box.h/ih)*state.photo.zoom;
    const w=iw*factor,h=ih*factor;
    const limX=Math.max(0,(w-box.w)/2),limY=Math.max(0,(h-box.h)/2);
    state.photo.x=clamp(state.photo.x,-limX,limX);
    state.photo.y=clamp(state.photo.y,-limY,limY);
    return {box,w,h,x:box.x+(box.w-w)/2+state.photo.x,y:box.y+(box.h-h)/2+state.photo.y,limX,limY};
  }
  function drawPhoto(ctx){
    const box=photoBox();ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();
    if(currentPhoto&&currentPhoto.complete&&currentPhoto.naturalWidth){
      const m=getPhotoMetrics();if(m)ctx.drawImage(currentPhoto,m.x,m.y,m.w,m.h);
    } else {
      let g=ctx.createLinearGradient(0,box.y,0,box.y+box.h);
      g.addColorStop(0,'#bca88f');g.addColorStop(1,'#827269');ctx.fillStyle=g;ctx.fillRect(box.x,box.y,box.w,box.h);
      ctx.fillStyle='white';ctx.font='30px Georgia';ctx.textAlign='center';ctx.fillText('Sua fotografia aqui',500,box.y+box.h/2);
    }
    // Slight dark bottom fade for a smooth photographic transition.
    const fade=ctx.createLinearGradient(0,box.y+box.h*.75,0,box.y+box.h);
    fade.addColorStop(0,'rgba(15,25,22,0)');fade.addColorStop(1,'rgba(18,25,21,.13)');
    ctx.fillStyle=fade;ctx.fillRect(box.x,box.y+box.h*.75,box.w,box.h*.25);ctx.restore();
  }
  function branch(ctx,len=160){
    const c=state.colors;ctx.save();ctx.lineCap='round';ctx.strokeStyle=blend(c.green,'#69523b',.42);ctx.lineWidth=4;
    ctx.beginPath();ctx.moveTo(-len*.50,2);ctx.quadraticCurveTo(-10,-9,len*.48,0);ctx.stroke();
    for(let i=0;i<25;i++){
      const t=i/24,x=-len*.46+len*.92*t;
      const spike=12+13*Math.sin(Math.PI*t);
      for(const sign of [-1,1]){
        ctx.strokeStyle=i%4===0?blend(c.green,'#bbad74',.24):c.green;ctx.lineWidth=2.2;
        ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-12+3*t,sign*spike);ctx.stroke();
        ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+2,0);ctx.lineTo(x+6,sign*spike*.77);ctx.stroke();
      }
    }
    ctx.restore();
  }
  function hollyLeaf(ctx,x,y,angle,size=28){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=state.colors.green;ctx.strokeStyle=blend(state.colors.green,'#000000',.25);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(-size/2,0);ctx.quadraticCurveTo(-size*.2,-size*.4,size*.08,-size*.25);ctx.lineTo(size*.25,-size*.34);ctx.lineTo(size*.32,-size*.1);ctx.lineTo(size/2,0);ctx.lineTo(size*.32,size*.1);ctx.lineTo(size*.25,size*.34);ctx.quadraticCurveTo(-size*.2,size*.4,-size/2,0);ctx.fill();ctx.stroke();ctx.strokeStyle=rgba(state.colors.gold,.6);ctx.beginPath();ctx.moveTo(-size*.45,0);ctx.lineTo(size*.4,0);ctx.stroke();ctx.restore();
  }
  function berry(ctx,x,y,r=6){
    ctx.fillStyle=state.colors.red;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,244,217,.7)';ctx.beginPath();ctx.arc(x-r*.25,y-r*.3,r*.26,0,Math.PI*2);ctx.fill();
  }
  function snowflake(ctx,x,y,r=15){
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=state.colors.gold;ctx.lineWidth=2;ctx.lineCap='round';
    for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,r);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.22,r*.68);ctx.lineTo(0,r*.83);ctx.lineTo(r*.22,r*.68);ctx.stroke();}
    ctx.restore();
  }
  function bow(ctx,x,y,size=1){
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    const red=state.colors.red,dark=blend(red,'#220f19',.32);
    ctx.fillStyle=dark;polygon(ctx,[[-11,5],[-42,39],[-22,32],[-16,50],[1,14]]);ctx.fill();
    polygon(ctx,[[11,5],[42,39],[22,32],[16,50],[-1,14]]);ctx.fill();
    ctx.fillStyle=red;ctx.strokeStyle=state.colors.gold;ctx.lineWidth=1.8;
    ctx.beginPath();ctx.moveTo(-9,1);ctx.bezierCurveTo(-40,-35,-65,-22,-60,1);ctx.bezierCurveTo(-59,21,-39,29,-8,7);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(9,1);ctx.bezierCurveTo(40,-35,65,-22,60,1);ctx.bezierCurveTo(59,21,39,29,8,7);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=blend(red,'#ffffff',.22);ctx.beginPath();ctx.ellipse(0,3,14,11,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.restore();
  }
  function decoratedBranch(ctx,x,y,mirror=1,scale=1){
    ctx.save();ctx.translate(x,y);ctx.scale(mirror*scale,scale);
    ctx.rotate(-.12);ctx.save();ctx.rotate(.10);branch(ctx,230);ctx.restore();
    ctx.save();ctx.translate(-45,-16);ctx.rotate(-.40);branch(ctx,150);ctx.restore();
    ctx.save();ctx.translate(43,13);ctx.rotate(.28);branch(ctx,125);ctx.restore();
    hollyLeaf(ctx,36,-7,.2,40);hollyLeaf(ctx,61,4,-.55,32);
    berry(ctx,10,-4,7);berry(ctx,20,-12,6);berry(ctx,18,4,6);berry(ctx,-35,15,5);
    if(state.ornaments){bow(ctx,-78,-8,.48);snowflake(ctx,92,-24,8);}
    ctx.restore();
  }
  function poinsettia(ctx,x,y,size=1){
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    for(let i=0;i<7;i++){
      ctx.save();ctx.rotate(i*2*Math.PI/7);ctx.fillStyle=i%2?blend(state.colors.red,'#af5843',.12):state.colors.red;
      ctx.beginPath();ctx.moveTo(0,-3);ctx.bezierCurveTo(-21,-15,-28,-42,-3,-50);ctx.bezierCurveTo(18,-39,14,-16,0,-3);ctx.fill();
      ctx.strokeStyle=rgba(state.colors.gold,.7);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(-1,-41);ctx.stroke();ctx.restore();
    }
    for(let i=0;i<5;i++){ctx.fillStyle=state.colors.gold;ctx.beginPath();ctx.arc(Math.sin(i*2)*7,Math.cos(i*2)*6,4,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function flowerCorner(ctx,x,y,mirror=1,scale=1){
    ctx.save();ctx.translate(x,y);ctx.scale(scale*mirror,scale);
    ctx.save();ctx.translate(7,5);ctx.rotate(-.62);branch(ctx,210);ctx.restore();
    ctx.save();ctx.translate(15,-5);ctx.rotate(.2);branch(ctx,160);ctx.restore();
    hollyLeaf(ctx,50,-30,-.2,42);hollyLeaf(ctx,-10,20,1.1,33);
    if(state.ornaments){poinsettia(ctx,-9,-10,.75);berry(ctx,65,-9,8);berry(ctx,76,-20,7);berry(ctx,78,-4,7);snowflake(ctx,110,-66,11);}
    ctx.restore();
  }
  function drawPlaque(ctx,item){
    const c=state.colors;ctx.save();ctx.translate(item.x,item.y);ctx.scale(item.scale,item.scale);
    if(state.plaque){
      const g=ctx.createLinearGradient(0,-65,0,65);
      g.addColorStop(0,blend(c.paper,'#ffffff',.75));g.addColorStop(.5,blend(c.paper,'#ffffff',.38));g.addColorStop(1,blend(c.paper,c.gold,.12));
      ctx.save();ctx.shadowColor='rgba(42,28,19,.26)';ctx.shadowBlur=14;ctx.shadowOffsetY=5;
      roundedPath(ctx,-173,-60,346,120,31);ctx.fillStyle=g;ctx.fill();ctx.restore();
      ctx.strokeStyle=blend(c.gold,'#88663e',.35);ctx.lineWidth=3;roundedPath(ctx,-173,-60,346,120,31);ctx.stroke();
      ctx.strokeStyle=rgba(c.gold,.65);ctx.lineWidth=1.5;roundedPath(ctx,-166,-53,332,106,27);ctx.stroke();
      ctx.fillStyle=c.gold;
      for (const sign of [-1,1]){
        ctx.save();ctx.scale(sign,1);snowflake(ctx,160,-2,15);snowflake(ctx,138,-38,8);ctx.restore();
      }
      snowflake(ctx,0,-59,15);snowflake(ctx,0,61,13);
    }
    ctx.font='500 83px Georgia, "Times New Roman", serif';ctx.fillStyle=c.gold;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(99,70,39,.22)';ctx.shadowBlur=1;ctx.shadowOffsetY=2;ctx.fillText(String(state.year),0,2);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.restore();
  }
  function drawCalendar(ctx,item){
    const c=state.colors,cols=state.cols,rows=12/cols;
    const width=914,spanH=626;
    const gapX=cols===4?17:25,gapY=cols===4?22:10;
    const cellW=(width-(cols-1)*gapX)/cols;
    const cellH=(spanH-(rows-1)*gapY)/rows;
    const size=item.scale*state.calendarScale;
    ctx.save();ctx.translate(item.x,item.y);ctx.scale(size,size);
    ctx.translate(-width/2,-spanH/2);
    const titleFont=cols===4?21:21,numberFont=cols===4?15:12.5,weekFont=cols===4?12:11;
    for(let m=0;m<12;m++){
      const col=m%cols,row=Math.floor(m/cols),x=col*(cellW+gapX),y=row*(cellH+gapY);
      if(state.monthLines){
        ctx.strokeStyle=rgba(c.gold,.35);ctx.lineWidth=1.1;
        if(col<cols-1){ctx.beginPath();ctx.moveTo(x+cellW+gapX/2,y+12);ctx.lineTo(x+cellW+gapX/2,y+cellH-5);ctx.stroke();}
        if(row<rows-1){ctx.beginPath();ctx.moveTo(x+7,y+cellH+gapY/2);ctx.lineTo(x+cellW-7,y+cellH+gapY/2);ctx.stroke();}
      }
      ctx.fillStyle=c.red;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.font=`500 ${titleFont}px Georgia,serif`;
      ctx.fillText(MONTHS[m].toLocaleUpperCase('pt-BR'),x+cellW/2,y+30);
      ctx.strokeStyle=rgba(c.gold,.65);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x+8,y+41);ctx.lineTo(x+cellW-8,y+41);ctx.stroke();
      const start=state.weekStart;
      const gridX=x+10,gridW=cellW-20,dayW=gridW/7;
      ctx.font=`600 ${weekFont}px Arial,sans-serif`;ctx.textBaseline='middle';
      for(let d=0;d<7;d++){
        const weekday=(d+start)%7;
        ctx.fillStyle=(weekday===0&&state.sunday)?c.red:c.ink;
        ctx.fillText(WEEKDAYS[weekday],gridX+dayW*(d+.5),y+57);
      }
      const first=new Date(Date.UTC(state.year,m,1)).getUTCDay();
      const offset=(first-start+7)%7;
      const maxDay=new Date(Date.UTC(state.year,m+1,0)).getUTCDate();
      // All date calculations use UTC; leap days and weekday alignment are exact.
      ctx.font=`${numberFont}px Georgia,serif`;
      const dateTop=cols===4?y+81:y+72, dateSpace=(cellH-(cols===4?92:82))/5.2;
      for(let n=1;n<=maxDay;n++){
        const idx=offset+n-1,dayCol=idx%7,weekRow=Math.floor(idx/7),weekday=(dayCol+start)%7;
        ctx.fillStyle=(weekday===0&&state.sunday)?c.red:c.ink;
        ctx.fillText(String(n),gridX+dayW*(dayCol+.5),dateTop+weekRow*dateSpace);
      }
    }
    ctx.restore();
  }
  function drawDecorations(ctx){
    if(state.pine){
      const a=state.items['ramo-esq'],b=state.items['ramo-dir'];
      decoratedBranch(ctx,a.x,a.y,1,a.scale);decoratedBranch(ctx,b.x,b.y,-1,b.scale);
      const d=state.items['flor-esq'],e=state.items['flor-dir'];
      flowerCorner(ctx,d.x,d.y,1,d.scale);flowerCorner(ctx,e.x,e.y,-1,e.scale);
    }
    const y=state.layout==='cima'?555:845;
    ctx.strokeStyle=rgba(state.colors.gold,.6);ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1000,y);ctx.stroke();
    if(state.ornaments){
      if(state.pine){for(const [x,v] of [[450,.8],[550,.8]])snowflake(ctx,x,y,v*11);}
      if(state.layout==='cima')for(const x of [150,850])snowflake(ctx,x,1343,10);
    }
  }
  function drawSignature(ctx){
    if(state.nameText.trim()){
      ctx.save();ctx.textAlign='center';ctx.fillStyle=state.colors.red;ctx.font='italic 500 24px Georgia,serif';
      ctx.fillText(state.nameText.trim(),500,state.layout==='cima'?1350:1390);ctx.restore();
    }
    if(!state.signature.trim())return;
    ctx.save();ctx.fillStyle=state.colors.red;ctx.globalAlpha=.74;
    ctx.textAlign='center';ctx.font='bold 16px Georgia,serif';
    ctx.fillText(state.signature.trim(),500,state.layout==='cima'?1380:812);ctx.restore();
  }
  function render(ctx,exporting=false){
    ctx.save();ctx.setTransform(ctx.canvas.width/WIDTH,0,0,ctx.canvas.height/HEIGHT,0,0);
    drawFullPaper(ctx);drawPhoto(ctx);
    // A soft line behind the modules adds subtle stationery texture.
    if(state.layout==='cima'){
      const shade=ctx.createLinearGradient(0,560,0,940);shade.addColorStop(0,rgba(state.colors.gold,.045));shade.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=shade;ctx.fillRect(0,555,1000,440);
    }
    drawCalendar(ctx,state.items.calendario);
    drawDecorations(ctx);
    drawPlaque(ctx,state.items.ano);
    drawSignature(ctx);drawCustomImages(ctx);
    if(!exporting)drawSelection(ctx);
    ctx.restore();
  }
  function calendarBounds(){
    const i=state.items.calendario,sc=i.scale*state.calendarScale;
    return{x:i.x-457*sc,y:i.y-313*sc,w:914*sc,h:626*sc};
  }
  function boundsFor(id){
    if(id==='foto')return photoBox();
    const i=state.items[id];if(!i && !id.startsWith('custom-'))return null;
    if(id==='calendario')return calendarBounds();
    if(id.startsWith('custom-')){const a=state.custom.find(v=>v.id===id);if(!a)return null;const w=a.w*a.scale,h=a.h*a.scale;return{x:a.x-w/2,y:a.y-h/2,w,h};}
    const [w,h]=id==='ano'?[350,122]:id.startsWith('ramo')?[300,150]:[210,180];
    return{x:i.x-w*i.scale/2,y:i.y-h*i.scale/2,w:w*i.scale,h:h*i.scale};
  }
  function drawSelection(ctx){
    if(!state.selected)return;
    const b=boundsFor(state.selected);if(!b)return;
    ctx.save();ctx.setLineDash([10,7]);ctx.lineWidth=2;ctx.strokeStyle='#3a8ca0';
    ctx.strokeRect(b.x+3,b.y+3,b.w-6,b.h-6);ctx.setLineDash([]);
    for(const [x,y] of [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]]){
      ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();
    }
    ctx.restore();
  }
  function redraw(){if(canvas.isConnected)render(context);}
  function drawCustomImages(ctx){
    state.custom.forEach(o=>{
      const img=customImages.get(o.id);
      if(!img||!img.complete||!img.naturalWidth)return;
      ctx.save();ctx.translate(o.x,o.y);ctx.scale(o.scale,o.scale);
      ctx.drawImage(img,-o.w/2,-o.h/2,o.w,o.h);ctx.restore();
    });
  }
  function setTab(tab){
    document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
    document.querySelectorAll('.panel').forEach(el=>el.classList.toggle('active',el.id===`panel-${tab}`));
  }
  function syncElementChoices(){
    const select=$('element-select'),prior=state.selected;
    select.replaceChildren();
    const entries=ELEMENTS.concat(state.custom.map((o,i)=>[o.id,o.label||`Adorno personalizado ${i+1}`]));
    for(const [id,label] of entries){
      const opt=document.createElement('option');opt.value=id;opt.textContent=label;select.append(opt);
    }
    if(!prior||!entries.some(x=>x[0]===prior))state.selected='foto';
    select.value=state.selected;
    syncElementControls();
  }
  function selectedItem(){return state.selected==='foto'?null:(state.items[state.selected]||state.custom.find(o=>o.id===state.selected));}
  function syncElementControls(){
    const item=selectedItem();
    const isPhoto=state.selected==='foto';
    const sc=isPhoto?state.photo.zoom:(item?item.scale:1);
    const x=isPhoto?state.photo.x:(item?item.x:500);
    const y=isPhoto?state.photo.y:(item?item.y:600);
    $('element-scale').value=clamp(Math.round(sc*100),45,175);
    $('element-x').value=x;
    $('element-y').value=y;
    $('element-scale-value').textContent=Math.round(sc*100)+'%';
    $('element-x-value').textContent=Math.round(x);
    $('element-y-value').textContent=Math.round(y);
    $('remove-element').hidden=!state.selected?.startsWith('custom-');
    $('element-select').value=state.selected;
  }
  function syncPhotoControls(){
    $('photo-zoom').value=Math.round(state.photo.zoom*100);
    $('photo-x').value=Math.round(state.photo.x);
    $('photo-y').value=Math.round(state.photo.y);
    $('photo-zoom-value').textContent=Math.round(state.photo.zoom*100)+'%';
    $('photo-x-value').textContent=Math.round(state.photo.x);
    $('photo-y-value').textContent=Math.round(state.photo.y);
    if(state.selected==='foto')syncElementControls();
  }
  function syncAllControls(){
    $('year').value=state.year;
    $('week-start').value=String(state.weekStart);
    $('grid-cols').value=String(state.cols);
    $('calendar-size').value=Math.round(state.calendarScale*100);
    $('calendar-size-value').textContent=Math.round(state.calendarScale*100)+'%';
    $('highlight-sunday').checked=state.sunday;
    $('show-pine').checked=state.pine;
    $('show-ornaments').checked=state.ornaments;
    $('show-month-lines').checked=state.monthLines;
    $('show-year-plaque').checked=state.plaque;
    $('signature').value=state.signature;
    $('name-text').value=state.nameText;
    $('paper-size').value=state.paper;
    $('dpi').value=String(state.dpi);
    for(const [key,inputId] of Object.entries({red:'color-red',green:'color-green',gold:'color-gold',paper:'color-paper',ink:'color-ink'}))$(inputId).value=state.colors[key];
    document.querySelectorAll('[data-theme]').forEach(btn=>btn.classList.toggle('selected',state.theme===btn.dataset.theme));
    $('photo-top').classList.toggle('selected',state.layout==='cima');
    $('photo-bottom').classList.toggle('selected',state.layout==='baixo');
    const leap=state.year%4===0&&(state.year%100!==0||state.year%400===0);
    $('leap-badge').textContent=leap?`${state.year} é bissexto: 366 dias. Fevereiro tem 29 dias.`:`${state.year} possui 365 dias. Fevereiro tem 28 dias.`;
    const [pw,ph]=dimensions();
    $('export-size').textContent=`${state.paper}, ${state.dpi} DPI: ${pw} × ${ph} pixels.`;
    $('preview-info').textContent=`${state.paper} • ${state.year} • 12 meses`;
    syncPhotoControls();syncElementChoices();redraw();
  }
  function dimensions(){
    const mm=state.paper==='A3'?[297,420]:[210,297];
    return mm.map(v=>Math.round(v/25.4*state.dpi));
  }
  function setTheme(name){
    if(!THEMES[name])return;
    state.theme=name;state.colors=clone(THEMES[name]);syncAllControls();
    showToast(`Paleta “${document.querySelector(`[data-theme="${name}"] strong`).textContent}” aplicada.`);
  }
  function setLayout(layout){
    if(state.layout===layout)return;
    state.layout=layout;state.items=defaultItems(layout);state.photo={x:0,y:0,zoom:1};
    syncAllControls();showToast(layout==='cima'?'Foto em cima, calendário embaixo.':'Calendário em cima, foto embaixo.');
  }
  function imgFromData(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível abrir esta imagem.'));img.src=src;});}
  function imageFileAsData(file){
    return new Promise((resolve,reject)=>{
      if(!file || !/^image\/(jpeg|png|webp)$/.test(file.type)){reject(new Error('Escolha uma foto JPG, PNG ou WebP.'));return;}
      const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));r.readAsDataURL(file);
    });
  }
  async function setPhotoFile(file){
    if(!file)return;
    try{
      setStatus('Abrindo fotografia...');
      const src=await imageFileAsData(file);
      const img=await imgFromData(src);
      currentPhoto=img;state.photoData=src;
      state.photo={zoom:1,x:0,y:0};
      photoLabel=`${file.name} • ${img.naturalWidth} × ${img.naturalHeight} px`;
      $('photo-meta').textContent=photoLabel;
      syncAllControls();setStatus('Fotografia pronta');
      if(img.naturalWidth<1600)showToast('Foto carregada! Para impressão A3, prefira uma foto original em alta resolução.');
      else showToast('Fotografia adicionada! Arraste para posicionar.');
    }catch(e){setStatus('Erro na fotografia');showToast(e.message,true);}
  }
  function paletteFromPhoto(){
    try{
      const c=document.createElement('canvas');c.width=96;c.height=96;
      const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(currentPhoto,0,0,96,96);
      const p=g.getImageData(0,0,96,96).data;
      let red=null,green=null,gold=null,redScore=0,greenScore=0,goldScore=0;
      let sum=[0,0,0],n=0;
      for(let i=0;i<p.length;i+=16){
        const r=p[i],b=p[i+2],gg=p[i+1],max=Math.max(r,gg,b),min=Math.min(r,gg,b),sat=max-min;
        if(max<40||max>250||sat<23)continue;
        sum[0]+=r;sum[1]+=gg;sum[2]+=b;n++;
        const base=r+gg+b;
        if(r>gg*1.27&&r>b*1.2&&sat>redScore){redScore=sat;red=[r,gg,b];}
        if(gg>r*1.10&&gg>b*.96&&sat>greenScore){greenScore=sat;green=[r,gg,b];}
        if(r>gg*1.1&&gg>b*1.15&&gg>75&&base>goldScore){goldScore=base;gold=[r,gg,b];}
      }
      const toHex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
      const mean=n?sum.map(v=>v/n):[190,157,125];
      state.colors.red=toHex(red||[Math.max(60,mean[0]*.65),Math.min(100,mean[1]*.3),Math.min(100,mean[2]*.32)]);
      state.colors.green=toHex(green||[45,90,66]);
      state.colors.gold=toHex(gold||[192,161,111]);
      state.colors.paper=blend(toHex(mean),'#ffffff',.86);
      state.colors.ink='#403a36';state.theme='personalizado';syncAllControls();
      showToast('Paleta extraída da fotografia. Você pode ajustar as cores manualmente.');
    }catch(e){showToast('Não foi possível analisar as cores desta imagem.',true);}
  }
  const pointOf=event=>{
    const r=canvas.getBoundingClientRect();
    return {x:(event.clientX-r.left)*WIDTH/r.width,y:(event.clientY-r.top)*HEIGHT/r.height};
  };
  function hitTest(x,y){
    for(const o of [...state.custom].reverse()){
      const b=boundsFor(o.id);if(b&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)return o.id;
    }
    const ids=['ano','ramo-esq','ramo-dir','flor-esq','flor-dir','calendario'];
    for(const id of ids){
      if(id.startsWith('ramo')&&!state.pine)continue;
      if(id.startsWith('flor')&&!state.pine)continue;
      const b=boundsFor(id);
      if(b&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)return id;
    }
    const b=photoBox();if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)return 'foto';
    return null;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(busy)return;
    const p=pointOf(e);
    const target=hitTest(p.x,p.y);
    if(!target){state.selected=null;redraw();return;}
    state.selected=target;syncElementControls();
    const item=selectedItem();
    dragging={id:target,start:p,x:target==='foto'?state.photo.x:item.x,y:target==='foto'?state.photo.y:item.y};
    canvas.setPointerCapture(e.pointerId);redraw();e.preventDefault();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const p=pointOf(e),dx=p.x-dragging.start.x,dy=p.y-dragging.start.y;
    if(dragging.id==='foto'){
      state.photo.x=dragging.x+dx;state.photo.y=dragging.y+dy;
      getPhotoMetrics();syncPhotoControls();
    }else{
      const item=selectedItem();if(item){item.x=clamp(dragging.x+dx,-100,1100);item.y=clamp(dragging.y+dy,-100,1514);syncElementControls();}
    }
    redraw();e.preventDefault();
  });
  function endDrag(){dragging=null;}
  canvas.addEventListener('pointerup',endDrag);
  canvas.addEventListener('pointercancel',endDrag);
  canvas.addEventListener('dblclick',e=>{const p=pointOf(e),b=photoBox();if(p.y>=b.y&&p.y<=b.y+b.h){state.photo={zoom:1,x:0,y:0};syncPhotoControls();redraw();showToast('Foto centralizada.');}});
  canvas.addEventListener('wheel',e=>{
    const p=pointOf(e),b=photoBox();if(p.y<b.y||p.y>b.y+b.h)return;
    e.preventDefault();state.photo.zoom=clamp(state.photo.zoom*(e.deltaY<0?1.05:.95),1,2.6);
    getPhotoMetrics();state.selected='foto';syncPhotoControls();redraw();
  },{passive:false});
  // Keyboard arrows nudge the selected decorative layer for precise work.
  document.addEventListener('keydown',e=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
    if(!state.selected)return;
    const step=e.shiftKey?10:2;
    const dx=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);
    const dy=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);
    if(state.selected==='foto'){state.photo.x+=dx;state.photo.y+=dy;getPhotoMetrics();syncPhotoControls();}
    else {const item=selectedItem();if(!item)return;item.x+=dx;item.y+=dy;syncElementControls();}
    redraw();e.preventDefault();
  });
  async function addOrnament(file){
    if(!file)return;
    try{
      const src=await imageFileAsData(file),img=await imgFromData(src);
      const ratio=Math.min(230/img.naturalWidth,230/img.naturalHeight);
      const id=`custom-${Date.now()}-${Math.floor(Math.random()*9999)}`;
      const o={id,label:`Imagem: ${file.name.slice(0,35)}`,data:src,x:790,y:state.layout==='cima'?120:1080,w:img.naturalWidth*ratio,h:img.naturalHeight*ratio,scale:1};
      state.custom.push(o);customImages.set(id,img);state.selected=id;syncElementChoices();redraw();
      showToast('Adorno adicionado! Clique e arraste para posicionar.');
    }catch(e){showToast(e.message,true);}
  }
  // The decorative library is local to this browser and uses IndexedDB. Project
  // JSON files still embed any ornaments already placed on the calendar.
  const localSpriteAssets=[];
  let spriteDbPromise=null;
  function spriteDb(){
    if(spriteDbPromise)return spriteDbPromise;
    spriteDbPromise=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('Seu navegador não oferece armazenamento local de adornos.'));return;}
      const req=indexedDB.open('grace-fotografia-adornos',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('imagens'))req.result.createObjectStore('imagens',{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Falha no armazenamento dos adornos.'));
    });
    return spriteDbPromise;
  }
  async function spriteOperation(mode,data){
    const db=await spriteDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('imagens',mode==='list'?'readonly':'readwrite');
      const store=tx.objectStore('imagens');
      const request=mode==='list'?store.getAll():mode==='put'?store.put(data):mode==='delete'?store.delete(data):store.clear();
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||Error('Não foi possível atualizar a biblioteca.'));
    });
  }
  function showSpriteGallery(){
    const gallery=$('sprite-gallery');gallery.replaceChildren();
    $('sprite-count').textContent=localSpriteAssets.length===1?'1 peça pronta para usar':`${localSpriteAssets.length} peças prontas para arrastar`;
    if(!localSpriteAssets.length){
      const empty=document.createElement('p');empty.className='empty-library';
      empty.innerHTML='<strong>Nenhuma peça ainda</strong><span>Solte uma folha de adornos na área acima. As imagens separadas aparecem aqui.</span>';
      gallery.append(empty);return;
    }
    for(const item of localSpriteAssets){
      const tile=document.createElement('div');tile.className='sprite-tile';
      const add=document.createElement('button');add.type='button';add.className='sprite-add';add.draggable=true;
      add.title='Arraste para o calendário ou clique para inserir: '+item.name;
      add.setAttribute('aria-label','Arrastar para o calendário ou inserir '+item.name);
      add.addEventListener('dragstart',e=>{
        if(!e.dataTransfer)return;
        e.dataTransfer.effectAllowed='copy';
        e.dataTransfer.setData('application/x-grace-adorno',item.id);
        e.dataTransfer.setData('text/plain','grace-adorno:'+item.id);
        tile.classList.add('dragging');
        $('canvas-stage').classList.add('ready-to-drop');
      });
      add.addEventListener('dragend',()=>{
        tile.classList.remove('dragging');$('canvas-stage').classList.remove('ready-to-drop','over-canvas');
      });
      const thumb=document.createElement('span');thumb.className='sprite-thumb';
      const im=document.createElement('img');im.src=item.src;im.alt=item.name;im.loading='lazy';im.draggable=false;thumb.append(im);
      const caption=document.createElement('span');caption.className='sprite-caption';caption.textContent=item.name.match(/peça (\d+)/)?.[0]||item.name.slice(-18);
      add.append(thumb,caption);add.addEventListener('click',()=>insertLibraryAsset(item));
      const del=document.createElement('button');del.type='button';del.className='sprite-delete';del.textContent='×';del.title='Excluir da biblioteca';del.setAttribute('aria-label','Excluir '+item.name);
      del.addEventListener('click',async()=>{
        try{await spriteOperation('delete',item.id);}catch(e){showToast('Não foi possível excluir do armazenamento; removido da sessão.',true);}
        const i=localSpriteAssets.findIndex(v=>v.id===item.id);if(i>=0)localSpriteAssets.splice(i,1);
        showSpriteGallery();
      });
      tile.append(add,del);gallery.append(tile);
    }
  }
  async function insertLibraryAsset(asset,position=null){
    try{
      const img=await imgFromData(asset.src);
      const factor=Math.min(280/img.naturalWidth,230/img.naturalHeight,1);
      const id=`custom-${Date.now()}-${Math.floor(Math.random()*1000000)}`;
      const obj={id,label:asset.name,data:asset.src,x:position?clamp(position.x,0,WIDTH):500,y:position?clamp(position.y,0,HEIGHT):(state.layout==='cima'?575:840),w:img.naturalWidth*factor,h:img.naturalHeight*factor,scale:1};
      state.custom.push(obj);customImages.set(id,img);state.selected=id;
      syncElementChoices();redraw();showToast(position?'Adorno colocado exatamente onde você soltou.':'Adorno inserido! Arraste-o no calendário para posicionar.');
    }catch(e){showToast('Não foi possível inserir este adorno.',true);}
  }
  async function loadSpriteLibrary(){
    try{
      const found=await spriteOperation('list');
      localSpriteAssets.splice(0,localSpriteAssets.length,...found);
      showSpriteGallery();
    }catch(e){
      $('sprite-status').textContent='Biblioteca temporária: seu navegador não permitiu salvar os adornos automaticamente.';
      showSpriteGallery();
    }
  }
  async function importSpriteFiles(files){
    if(!files?.length)return;
    const input=$('sprite-file'),status=$('sprite-status');
    const mode=$('sprite-mode').value,tolerance=Number($('sprite-tolerance').value),minimum=Number($('sprite-minimum').value),color=$('sprite-color').value;
    let imported=0,skipped=0;
    input.disabled=true;status.classList.add('processing');
    try{
      for(const [index,file] of Array.from(files).entries()){
        status.textContent=`Separando as peças de ${file.name} (${index+1}/${files.length})…`;
        // Yield once so the progress label is actually painted before heavy canvas work.
        await new Promise(done=>requestAnimationFrame(()=>setTimeout(done,0)));
        const result=await window.SpriteSheetTools.extract(file,{mode,tolerance,minimum,color});
        skipped+=Math.max(0,result.total-result.items.length);
        if(!result.items.length){status.textContent=`Nenhuma peça encontrada em ${file.name}. Tente outra tolerância ou modo de fundo.`;continue;}
        for(const [j,part] of result.items.entries()){
          const record={id:`sprite-${Date.now()}-${Math.floor(Math.random()*100000000)}-${j}`,name:part.name,src:part.src,w:part.w,h:part.h};
          localSpriteAssets.push(record);imported++;
          try{await spriteOperation('put',record);}catch(e){/* Session fallback: items still work until browser closes. */}
        }
        showSpriteGallery();
      }
      status.textContent=imported?`✓ ${imported} peça(s) recortada(s). Arraste as miniaturas da biblioteca até o calendário.`:'Não encontrei peças. Tente mudar o modo de fundo ou a tolerância.';
      showToast(imported?`${imported} peças prontas! Arraste da biblioteca para o calendário.`:'Nenhuma peça encontrada. Ajuste o recorte.',!imported);
    }catch(e){status.textContent=e.message;showToast(`Erro ao recortar: ${e.message}`,true);}
    finally{input.disabled=false;input.value='';status.classList.remove('processing');showSpriteGallery();}
  }
  $('sprite-file').addEventListener('change',e=>importSpriteFiles(e.target.files));
  // Fluxo visual: soltar uma folha inteira na aba Elementos produz miniaturas
  // individuais; cada miniatura pode ser arrastada para o ponto exato da página.
  const elementPanel=$('panel-elementos');
  const spriteDropzone=$('sprite-dropzone');
  const imageFiles=e=>Array.from(e.dataTransfer?.files||[]).filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type));
  const hasFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  spriteDropzone.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();$('sprite-file').click();}
  });
  elementPanel.addEventListener('dragenter',e=>{
    if(hasFiles(e)){e.preventDefault();spriteDropzone.classList.add('drag-over');}
  });
  elementPanel.addEventListener('dragover',e=>{
    if(!hasFiles(e))return;
    e.preventDefault();e.dataTransfer.dropEffect='copy';spriteDropzone.classList.add('drag-over');
  });
  elementPanel.addEventListener('dragleave',e=>{
    if(hasFiles(e)&&!elementPanel.contains(e.relatedTarget))spriteDropzone.classList.remove('drag-over');
  });
  elementPanel.addEventListener('drop',e=>{
    if(!hasFiles(e))return;
    e.preventDefault();e.stopPropagation();spriteDropzone.classList.remove('drag-over');
    const files=imageFiles(e);
    if(!files.length){showToast('Use imagens PNG, JPG ou WebP.',true);return;}
    importSpriteFiles(files);
  });
  // Arquivos também podem ser soltados em qualquer ponto da prévia caso a aba
  // Elementos esteja aberta. A folha nunca é colocada inteira no pôster.
  const stage=$('canvas-stage');
  const cleanupDrop=()=>stage.classList.remove('ready-to-drop','over-canvas');
  canvas.addEventListener('dragenter',e=>{
    if(hasFiles(e)||e.dataTransfer?.types?.includes('application/x-grace-adorno')){e.preventDefault();stage.classList.add('over-canvas');}
  });
  canvas.addEventListener('dragover',e=>{
    if(hasFiles(e)||Array.from(e.dataTransfer?.types||[]).includes('application/x-grace-adorno')){
      e.preventDefault();e.dataTransfer.dropEffect='copy';stage.classList.add('over-canvas');
    }
  });
  canvas.addEventListener('dragleave',()=>stage.classList.remove('over-canvas'));
  canvas.addEventListener('drop',e=>{
    const id=e.dataTransfer?.getData('application/x-grace-adorno') ||
      (e.dataTransfer?.getData('text/plain')||'').replace(/^grace-adorno:/,'');
    if(id&&localSpriteAssets.some(a=>a.id===id)){
      e.preventDefault();e.stopPropagation();
      const asset=localSpriteAssets.find(a=>a.id===id);
      cleanupDrop();insertLibraryAsset(asset,pointOf(e));return;
    }
    if(hasFiles(e)&&document.querySelector('.tab[data-tab="elementos"]').classList.contains('active')){
      e.preventDefault();e.stopPropagation();cleanupDrop();importSpriteFiles(imageFiles(e));
    }
  });
  // Evita que soltar uma imagem na página abra o arquivo no lugar do editor.
  document.addEventListener('dragover',e=>{
    if(hasFiles(e)&&document.querySelector('.tab[data-tab="elementos"]').classList.contains('active'))e.preventDefault();
  });
  document.addEventListener('drop',e=>{
    if(!hasFiles(e))return;
    if(!document.querySelector('.tab[data-tab="elementos"]').classList.contains('active'))return;
    e.preventDefault();spriteDropzone.classList.remove('drag-over');cleanupDrop();
    if(!elementPanel.contains(e.target)&&e.target!==canvas)importSpriteFiles(imageFiles(e));
  });

  $('sprite-mode').addEventListener('change',e=>{$('sprite-color-row').hidden=e.target.value!=='cor';});
  $('sprite-tolerance').addEventListener('input',e=>{$('sprite-tolerance-value').textContent=e.target.value;});
  $('clear-sprites').addEventListener('click',async()=>{
    if(!localSpriteAssets.length)return;
    if(!confirm('Apagar todos os adornos da biblioteca deste navegador? Os já colocados no calendário permanecerão no projeto.'))return;
    try{await spriteOperation('clear');}catch(e){showToast('Não foi possível limpar o armazenamento do navegador.',true);return;}
    localSpriteAssets.length=0;showSpriteGallery();$('sprite-status').textContent='Biblioteca limpa.';
  });
  loadSpriteLibrary();

  function changeElement(id){state.selected=id;syncElementControls();redraw();}
  for(const b of document.querySelectorAll('.tab'))b.addEventListener('click',()=>setTab(b.dataset.tab));
  $('open-photo').addEventListener('click',()=>$('photo-file').click());
  $('go-export').addEventListener('click',()=>setTab('exportar'));
  $('photo-top').addEventListener('click',()=>setLayout('cima'));
  $('photo-bottom').addEventListener('click',()=>setLayout('baixo'));
  for(const b of document.querySelectorAll('[data-theme]'))b.addEventListener('click',()=>setTheme(b.dataset.theme));
  $('photo-file').addEventListener('change',e=>{setPhotoFile(e.target.files[0]);e.target.value='';});
  $('ornament-file').addEventListener('change',e=>{addOrnament(e.target.files[0]);e.target.value='';});
  $('extract-colors').addEventListener('click',paletteFromPhoto);
  $('photo-center').addEventListener('click',()=>{state.photo={x:0,y:0,zoom:1};syncPhotoControls();redraw();});
  for(const [id,key,min,max] of [['photo-zoom','zoom',100,260],['photo-x','x',-500,500],['photo-y','y',-500,500]]){
    $(id).addEventListener('input',e=>{
      state.photo[key]=key==='zoom'?Number(e.target.value)/100:Number(e.target.value);
      getPhotoMetrics();syncPhotoControls();redraw();
    });
  }
  $('year').addEventListener('change',e=>{
    const y=Number(e.target.value);
    if(!isYearValid(y)){showToast('Escolha um ano inteiro entre 1900 e 2100.',true);e.target.value=state.year;return;}
    state.year=y;syncAllControls();
  });
  $('week-start').addEventListener('change',e=>{state.weekStart=Number(e.target.value);redraw();});
  $('grid-cols').addEventListener('change',e=>{state.cols=Number(e.target.value);redraw();});
  $('calendar-size').addEventListener('input',e=>{state.calendarScale=Number(e.target.value)/100;$('calendar-size-value').textContent=e.target.value+'%';redraw();});
  for(const [id,key] of [['highlight-sunday','sunday'],['show-pine','pine'],['show-ornaments','ornaments'],['show-month-lines','monthLines'],['show-year-plaque','plaque']])$(id).addEventListener('change',e=>{state[key]=e.target.checked;redraw();});
  for(const [id,key] of [['color-red','red'],['color-green','green'],['color-gold','gold'],['color-paper','paper'],['color-ink','ink']])$(id).addEventListener('input',e=>{state.colors[key]=e.target.value;state.theme='personalizado';document.querySelectorAll('[data-theme]').forEach(b=>b.classList.remove('selected'));redraw();});
  $('signature').addEventListener('input',e=>{state.signature=e.target.value;redraw();});
  $('name-text').addEventListener('input',e=>{state.nameText=e.target.value;redraw();});
  $('element-select').addEventListener('change',e=>changeElement(e.target.value));
  $('element-scale').addEventListener('input',e=>{
    const v=Number(e.target.value)/100;if(state.selected==='foto'){state.photo.zoom=clamp(v,1,2.6);getPhotoMetrics();syncPhotoControls();}
    else {const item=selectedItem();if(item)item.scale=v;}
    syncElementControls();redraw();
  });
  for(const [id,key] of [['element-x','x'],['element-y','y']])$(id).addEventListener('input',e=>{
    const val=Number(e.target.value);
    if(state.selected==='foto'){state.photo[key]=val;getPhotoMetrics();syncPhotoControls();}
    else {const item=selectedItem();if(item)item[key]=val;}
    syncElementControls();redraw();
  });
  $('remove-element').addEventListener('click',()=>{
    if(!state.selected?.startsWith('custom-'))return;
    state.custom=state.custom.filter(o=>o.id!==state.selected);
    customImages.delete(state.selected);state.selected='foto';syncElementChoices();redraw();
  });
  $('element-reset').addEventListener('click',()=>{
    if(state.selected==='foto'){state.photo={x:0,y:0,zoom:1};syncPhotoControls();}
    else if(!state.selected?.startsWith('custom-')){
      const v=defaultItems(state.layout)[state.selected];if(v)state.items[state.selected]=v;
    }else{const i=selectedItem();if(i){i.scale=1;i.x=790;i.y=state.layout==='cima'?120:1080;}}
    syncElementControls();redraw();
  });
  $('all-reset').addEventListener('click',()=>{
    if(!confirm('Restaurar posição, tamanho e enquadramento de todos os elementos? As cores, o ano e as imagens continuarão.'))return;
    state.items=defaultItems(state.layout);state.calendarScale=1;state.photo={x:0,y:0,zoom:1};
    syncAllControls();showToast('Posições originais restauradas.');
  });
  $('paper-size').addEventListener('change',e=>{state.paper=e.target.value;syncAllControls();});
  $('dpi').addEventListener('change',e=>{state.dpi=Number(e.target.value);syncAllControls();});
  async function renderPrintCanvas(){
    const [w,h]=dimensions(),c=document.createElement('canvas');
    c.width=w;c.height=h;
    const ctx=c.getContext('2d',{alpha:false});if(!ctx)throw Error('Seu navegador não conseguiu criar a imagem.');
    render(ctx,true);return c;
  }
  function asBlob(canvas,type,quality){return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Falha ao criar o arquivo.')),type,quality));}
  function saveBlob(blob,name){
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  async function download(type){
    if(busy)return;
    busy=true;const id=type==='pdf'?'download-pdf':'download-png';
    $('download-pdf').disabled=$('download-png').disabled=true;
    try{
      setStatus(`Preparando ${type.toUpperCase()} em ${state.dpi} DPI...`);
      await new Promise(resolve=>setTimeout(resolve,35));
      const img=await renderPrintCanvas();
      let blob,name;
      if(type==='pdf'){
        const jpeg=new Uint8Array(await (await asBlob(img,'image/jpeg',0.97)).arrayBuffer());
        blob=window.GraceExport.pdfFromJpeg(jpeg,img.width,img.height,state.paper);name=`Calendario_${state.year}_Grace_${state.paper}_${state.dpi}dpi.pdf`;
      }else{
        blob=await window.GraceExport.addPngDpi(await asBlob(img,'image/png'),state.dpi);
        name=`Calendario_${state.year}_Grace_${state.paper}_${state.dpi}dpi.png`;
      }
      // Releasing the backing store helps low-memory machines, especially for A3.
      img.width=1;img.height=1;
      saveBlob(blob,name);showToast(`${type.toUpperCase()} criado com sucesso (${state.paper}, ${state.dpi} DPI).`);setStatus('Arquivo pronto para impressão');
    }catch(e){console.error(e);setStatus('Erro ao exportar');showToast(`${e.message}. Tente A4 ou 150 DPI.`,true);}
    finally{busy=false;$('download-pdf').disabled=$('download-png').disabled=false;}
  }
  $('download-png').addEventListener('click',()=>download('png'));
  $('download-pdf').addEventListener('click',()=>download('pdf'));
  $('save-project').addEventListener('click',()=>{
    const data={app:'AtelieGrace',version:1,createdAt:new Date().toISOString(),state:clone(state)};
    data.state.photoData=state.photoData;
    // Demo image is bundled with the ZIP; no need to make the JSON huge unless the photo was changed.
    const text=JSON.stringify(data,null,2);
    saveBlob(new Blob([text],{type:'application/json'}),`Projeto_Calendario_${state.year}_Grace.json`);
    showToast('Projeto editável salvo. Guarde o arquivo JSON para continuar depois.');
  });
  $('load-project').addEventListener('change',async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    try{
      const content=JSON.parse(await file.text());
      if(content.app!=='AtelieGrace'||!content.state||!isYearValid(Number(content.state.year)))throw Error('Este não é um projeto válido do Ateliê Grace.');
      const incoming=content.state;
      if(!['cima','baixo'].includes(incoming.layout)||![3,4].includes(incoming.cols)||!['A3','A4'].includes(incoming.paper)||![150,300].includes(incoming.dpi))throw Error('Dados de projeto incompletos ou inválidos.');
      if(incoming.photoData){const img=await imgFromData(incoming.photoData);currentPhoto=img;photoLabel=`Foto recuperada • ${img.naturalWidth} × ${img.naturalHeight} px`;}
      else{currentPhoto=demoPhoto;photoLabel='Foto demonstrativa do projeto.';}
      const prepared=[];
      for(const o of (Array.isArray(incoming.custom)?incoming.custom:[]).slice(0,25)){
        if(!o.data||!o.id?.startsWith('custom-'))continue;
        const img=await imgFromData(o.data);prepared.push([o.id,img]);
      }
      Object.assign(state,{...incoming,custom:Array.isArray(incoming.custom)?incoming.custom.slice(0,25):[]});
      customImages.clear();prepared.forEach(([id,img])=>customImages.set(id,img));
      state.selected=null;
      $('photo-meta').textContent=photoLabel;syncAllControls();showToast('Projeto recuperado. Continue a edição normalmente.');
    }catch(err){console.error(err);showToast(err.message||'Não foi possível abrir o projeto.',true);}
  });
  demoPhoto.onload=()=>{syncAllControls();setStatus('Pronto para editar');};
  demoPhoto.onerror=()=>{setStatus('Abra a pasta completa com a foto de demonstração');syncAllControls();};
  demoPhoto.src='assets/foto-demonstracao.jpg';
  syncAllControls();
})();
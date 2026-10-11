/* Grace Fotografia — edição visual, histórico e rascunhos locais. Sem dependências externas. */
(() => {
  'use strict';
  const E = window.GraceEditor;
  if (!E) { console.error('Núcleo do editor não encontrado.'); return; }
  const {state, canvas, customImages} = E;
  const $ = id => document.getElementById(id);
  const safeClone = value => JSON.parse(JSON.stringify(value));
  const MAX_HISTORY = 40;
  const history = [];
  let cursor = -1, recording = false, active = null, clipboard = null, cropMode = false;
  let changeTimer, saveTimer, dbPromise, savedHash = '', restoring = false;
  const inspector = $('selection-inspector');
  const labels = {
    foto:'Fotografia', ano:'Ano e moldura', calendario:'Calendário anual',
    'ramo-esq':'Folhagem esquerda','ramo-dir':'Folhagem direita',
    'flor-esq':'Arranjo esquerdo','flor-dir':'Arranjo direito'
  };
  function selected() { return state.selected; }
  function custom() { return state.custom.find(a => a.id === selected()); }
  function obj() { return selected() === 'foto' ? state.photo : (custom() || state.items[selected()]); }
  function isEditableText() {
    const a = document.activeElement;
    return !!a && (['INPUT','SELECT','TEXTAREA'].includes(a.tagName) || a.isContentEditable);
  }
  function announce(message) { $('editor-save-status').textContent = message; }
  function snapshot() {
    // O nome da imagem é preservado, mas o histórico guarda snapshots de estados,
    // nunca cópias dos bitmaps decodificados em canvas.
    const s = safeClone(state);
    s.selected = null;
    return JSON.stringify(s);
  }
  function refreshButtons() {
    $('inspector-restore').hidden=!(state.hidden || []).length;
    $('inspector-restore').textContent=`Restaurar objetos do modelo (${(state.hidden || []).length})`;
    $('edit-undo').disabled = cursor <= 0;
    $('edit-redo').disabled = cursor >= history.length - 1;
    const id = selected(), isCustom = !!custom();
    $('inspector-empty').hidden = !!id;
    $('inspector-fields').hidden = !id;
    if (!id) { $('selection-inspector').classList.remove('has-selection'); return; }
    inspector.classList.add('has-selection');
    $('inspector-name').textContent = custom()?.label || labels[id] || 'Elemento';
    const target = obj();
    const zoom = id === 'foto' ? state.photo.zoom : (target?.scale || 1);
    $('inspector-scale').value = Math.round(zoom * 100);
    $('inspector-scale-value').textContent = Math.round(zoom * 100) + '%';
    $('inspector-scale').min = id === 'foto' ? '100' : '15';
    $('inspector-scale').max = id === 'foto' ? '260' : '400';
    $('inspector-x').value = Math.round(target?.x || 0);
    $('inspector-y').value = Math.round(target?.y || 0);
    $('inspector-delete').disabled = id === 'foto';
    $('inspector-copy').disabled = !isCustom;
    $('inspector-cut').disabled = !isCustom;
    $('inspector-crop').hidden = !isCustom;

  }
  function record() {
    if (restoring || recording) return;
    const snap = snapshot();
    if (history[cursor] === snap) return;
    history.splice(cursor + 1);
    history.push(snap);
    if (history.length > MAX_HISTORY) history.shift();
    cursor = history.length - 1;
    refreshButtons();
    announce('Alterações não salvas em arquivo • rascunho automático ativo');
    queueSave();
  }
  async function apply(snapshotValue) {
    restoring = true;
    try {
      const next = JSON.parse(snapshotValue);
      const values = next.custom || [];
      // Imagens voltam mesmo depois de serem excluídas ou de um desfazer.
      for (const image of values) {
        const existing = customImages.get(image.id);
        if (!existing || existing.src !== image.data) {
          customImages.set(image.id, await E.imgFromData(image.data));
        }
      }
      if (next.photoData !== state.photoData) {
        E.setCurrentPhoto(next.photoData ? await E.imgFromData(next.photoData) : E.demoPhoto);
      }
      Object.assign(state, next);
      state.hidden = Array.isArray(next.hidden) ? next.hidden : [];
      state.selected = null;
      E.syncAllControls();
      refreshButtons();
      queueSave();
    } catch (err) {
      console.error(err);
      E.showToast('Não consegui recuperar essa alteração.', true);
    } finally { restoring = false; }
  }
  function undo() { if (cursor > 0) { cursor--; void apply(history[cursor]); refreshButtons(); } }
  function redo() { if (cursor < history.length - 1) { cursor++; void apply(history[cursor]); refreshButtons(); } }
  function select(id) {
    state.selected = id;
    if(id) E.syncElementControls();
    refreshButtons();E.redraw();
  }
  function deleteSelected() {
    const id = selected();
    if (!id || id === 'foto') return;
    if (id.startsWith('custom-')) {
      state.custom = state.custom.filter(x => x.id !== id);
      // Não apagar a imagem decodificada: desfazer precisa dela.
    } else {
      state.hidden ||= [];
      if (!state.hidden.includes(id)) state.hidden.push(id);
    }
    select(null);
    E.syncElementChoices();
    record();
    E.showToast('Objeto excluído. Use Desfazer para recuperá-lo.');
  }
  function copy() {
    if (!custom()) return;
    clipboard = safeClone(custom());
    E.showToast('Elemento copiado. Use Colar ou Ctrl+V.');
  }
  function cut() { if (!custom()) return; copy(); deleteSelected(); }
  async function paste() {
    if (!clipboard) { E.showToast('Selecione e copie um adorno primeiro.'); return; }
    const item = safeClone(clipboard);
    item.id = `custom-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
    item.x = Math.min(1100, item.x + 26);item.y = Math.min(1514, item.y + 26);
    state.custom.push(item);
    customImages.set(item.id, await E.imgFromData(item.data));
    clipboard = safeClone(item);
    E.syncElementChoices();select(item.id);record();
  }
  function restoreHidden() {
    state.hidden = []; E.redraw(); record(); refreshButtons();
    E.showToast('Adornos originais restaurados.');
  }
  function coordinates(evt) { return E.pointOf(evt); }
  function handleAt(id, p) {
    if (!id) return null;
    const b = E.boundsFor(id);if (!b) return null;
    const sides = [
      ['nw',b.x,b.y],['ne',b.x+b.w,b.y],
      ['sw',b.x,b.y+b.h],['se',b.x+b.w,b.y+b.h]
    ];
    return sides.find(([,x,y]) => Math.abs(p.x - x) <= 17 && Math.abs(p.y - y) <= 17)?.[0] || null;
  }
  function inside(b,p) { return p.x >= b.x && p.y >= b.y && p.x <= b.x+b.w && p.y <= b.y+b.h; }
  function clamp(v,min,max) { return Math.min(max,Math.max(min,v)); }
  function onPointerDown(evt) {
    if (evt.button !== 0) return;
    const p=coordinates(evt);
    if (cropMode) {
      if(!custom()) {cropMode=false;return;}
      const b=E.boundsFor(selected());
      if(!inside(b,p)){ E.showToast('Comece o recorte dentro do adorno.',true);evt.stopImmediatePropagation();return; }
      active={mode:'crop',id:selected(),start:p,last:p};
    } else {
      const handle=handleAt(selected(),p);
      const target=handle ? selected() : E.hitTest(p.x,p.y);
      if (!target) { select(null);evt.stopImmediatePropagation();return; }
      if (!handle) select(target);
      const item=obj(); const b=E.boundsFor(target);
      active={id:target,mode:handle?'resize':'move',handle,start:p,b,scale:item?.scale || 1,
        x:item?.x || 0,y:item?.y || 0, zoom:state.photo.zoom};
    }
    canvas.setPointerCapture(evt.pointerId);
    evt.preventDefault();evt.stopImmediatePropagation();
  }
  function onPointerMove(evt) {
    const p=coordinates(evt);
    if (!active) {
      const handle=handleAt(selected(),p);
      canvas.style.cursor=cropMode?'crosshair':handle ? (handle==='nw'||handle==='se'?'nwse-resize':'nesw-resize') : 'grab';
      return;
    }
    const {start}=active;
    const dx=p.x-start.x,dy=p.y-start.y;
    if (active.mode==='crop') { active.last=p; drawCropOverlay(); }
    else if (active.mode==='move') {
      if (active.id==='foto') {
        state.photo.x=active.x+dx;state.photo.y=active.y+dy;
        E.getPhotoMetrics();E.syncPhotoControls();
      } else {
        const item=obj();
        if (item) { item.x=clamp(active.x+dx,-250,1250);item.y=clamp(active.y+dy,-250,1664);E.syncElementControls(); }
      }
      E.redraw();
    } else if (active.mode==='resize') {
      if(active.id==='foto') {
        const old=Math.max(10,Math.hypot(start.x-500,start.y-(state.layout==='cima'?278:1129)));
        const now=Math.hypot(p.x-500,p.y-(state.layout==='cima'?278:1129));
        state.photo.zoom=clamp(active.zoom*now/old,1,2.6);
        E.getPhotoMetrics();E.syncPhotoControls();E.redraw();
        evt.preventDefault();evt.stopImmediatePropagation();return;
      }
      const b=active.b;
      const fixedX=active.handle.includes('w')?b.x+b.w:b.x;
      const fixedY=active.handle.includes('n')?b.y+b.h:b.y;
      const startDist=Math.hypot(start.x-fixedX,start.y-fixedY);
      const nextDist=Math.hypot(p.x-fixedX,p.y-fixedY);
      const factor=clamp(nextDist/Math.max(1,startDist),.1,8);
      const item=obj();
      if (item) {
        const nextScale=clamp(active.scale*factor,.15,4);
        // Mantém o canto oposto parado durante o redimensionamento.
        const w=b.w*nextScale/active.scale,h=b.h*nextScale/active.scale;
        item.scale=nextScale;
        item.x=active.handle.includes('w')?fixedX-w/2:fixedX+w/2;
        item.y=active.handle.includes('n')?fixedY-h/2:fixedY+h/2;
        E.syncElementControls();E.redraw();
      }
    }
    evt.preventDefault();evt.stopImmediatePropagation();
  }
  function drawCropOverlay() {
    E.redraw(); if (!active || active.mode!=='crop') return;
    const p=active.last, q=active.start, ctx=canvas.getContext('2d');
    ctx.save();ctx.fillStyle='#1e64733b';ctx.strokeStyle='#3da7b6';ctx.lineWidth=3;
    ctx.fillRect(Math.min(p.x,q.x),Math.min(p.y,q.y),Math.abs(p.x-q.x),Math.abs(p.y-q.y));
    ctx.setLineDash([10,6]);ctx.strokeRect(Math.min(p.x,q.x),Math.min(p.y,q.y),Math.abs(p.x-q.x),Math.abs(p.y-q.y));ctx.restore();
  }
  async function finalizeCrop(drag) {
    const item=state.custom.find(x=>x.id===drag.id);
    if (!item) return;
    const b=E.boundsFor(item.id);
    const p=drag.start,q=drag.last;
    const left=clamp((Math.min(p.x,q.x)-b.x)/b.w,0,1), right=clamp((Math.max(p.x,q.x)-b.x)/b.w,0,1);
    const top=clamp((Math.min(p.y,q.y)-b.y)/b.h,0,1), bottom=clamp((Math.max(p.y,q.y)-b.y)/b.h,0,1);
    if (right-left<.04 || bottom-top<.04) {E.showToast('Selecione uma área maior para recortar.',true);return;}
    const image=customImages.get(item.id);
    if(!image)return;
    const width=Math.max(1,Math.round(image.naturalWidth*(right-left)));
    const height=Math.max(1,Math.round(image.naturalHeight*(bottom-top)));
    const c=document.createElement('canvas');c.width=width;c.height=height;
    c.getContext('2d').drawImage(image,image.naturalWidth*left,image.naturalHeight*top,width,height,0,0,width,height);
    const url=c.toDataURL('image/png');
    item.x=b.x+b.w*(left+right)/2;item.y=b.y+b.h*(top+bottom)/2;
    item.w*=right-left;item.h*=bottom-top;item.data=url;
    customImages.set(item.id,await E.imgFromData(url));
    E.syncElementControls();E.redraw();record();
    E.showToast('Adorno recortado. Desfazer continua disponível.');
  }
  function onPointerUp(evt) {
    if (!active) return;
    const drag=active;active=null;
    if(drag.mode==='crop') {cropMode=false;inspector.classList.remove('crop-active');void finalizeCrop(drag);}
    else {record();}
    try { canvas.releasePointerCapture(evt.pointerId); } catch (_) {}
    evt.preventDefault();evt.stopImmediatePropagation();
  }
  canvas.addEventListener('pointerdown',onPointerDown,true);
  canvas.addEventListener('pointermove',onPointerMove,true);
  canvas.addEventListener('pointerup',onPointerUp,true);
  canvas.addEventListener('pointercancel',onPointerUp,true);
  canvas.addEventListener('dblclick',evt => { evt.stopImmediatePropagation(); },true);
  canvas.addEventListener('wheel',evt=>{
    const p=coordinates(evt),id=E.hitTest(p.x,p.y);
    if(!id || id==='foto') {setTimeout(record,60);return;}
    evt.preventDefault();evt.stopImmediatePropagation();select(id);
    const item=obj(); item.scale=clamp(item.scale*(evt.deltaY<0?1.06:.94),.15,4);
    E.syncElementControls();E.redraw();debouncedRecord(250);
  },{capture:true,passive:false});
  function debouncedRecord(ms=300) {clearTimeout(changeTimer);changeTimer=setTimeout(record,ms);}
  $('edit-undo').addEventListener('click',undo);
  $('edit-redo').addEventListener('click',redo);
  $('inspector-delete').addEventListener('click',deleteSelected);
  $('inspector-copy').addEventListener('click',copy);
  $('inspector-cut').addEventListener('click',cut);
  $('inspector-paste').addEventListener('click',()=>void paste());
  $('inspector-restore').addEventListener('click',restoreHidden);
  $('inspector-crop').addEventListener('click',()=>{
    if (!custom()) return;
    cropMode=!cropMode;inspector.classList.toggle('crop-active',cropMode);
    E.showToast(cropMode?'Arraste sobre o adorno a área que deseja manter.':'Recorte cancelado.');
  });
  $('inspector-scale').addEventListener('input',evt=>{
    if(!selected())return;
    const value=Number(evt.target.value)/100;
    if(selected()==='foto') {state.photo.zoom=clamp(value,1,2.6);E.getPhotoMetrics();E.syncPhotoControls();}
    else obj().scale=clamp(value,.15,4);
    E.syncElementControls();E.redraw();refreshButtons();debouncedRecord(300);
  });
  for (const axis of ['x','y']) {
    $(`inspector-${axis}`).addEventListener('change',evt=>{
      if(!selected())return;
      obj()[axis]=Number(evt.target.value);
      if (selected()==='foto')E.getPhotoMetrics();
      E.syncElementControls();E.redraw();record();refreshButtons();
    });
  }
  $('save-editable').addEventListener('click',()=>{
    $('save-project').click();
    void saveDraft();
    announce('Arquivo JSON baixado • rascunho atualizado');
  });
  $('save-draft').addEventListener('click',()=>void saveDraft(true));
  $('open-editable').addEventListener('click',()=>$('load-project').click());
  function saveDB() {
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(Error('IndexedDB não disponível'));return;}
      const request=indexedDB.open('grace-editor-projects',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts',{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||Error('Erro ao abrir o banco local'));
    });
    return dbPromise;
  }
  async function draft(mode,value) {
    const db=await saveDB();
    return new Promise((resolve,reject)=>{
      const trans=db.transaction('drafts',mode==='get'?'readonly':'readwrite');
      const request=mode==='get'?trans.objectStore('drafts').get('atual'):
        trans.objectStore('drafts').put({id:'atual',time:Date.now(),state:value});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||Error('Não foi possível salvar o projeto'));
    });
  }
  function queueSave() { clearTimeout(saveTimer);saveTimer=setTimeout(()=>void saveDraft(false),1200); }
  async function saveDraft(withMessage=false) {
    const value=snapshot();
    if(value===savedHash){if(withMessage)E.showToast('Rascunho atualizado neste computador.');return;}
    try {
      await draft('put',value);savedHash=value;
      announce('Rascunho salvo automaticamente neste computador');
      if(withMessage)E.showToast('Rascunho salvo! Ele será recuperado quando reabrir o editor.');
    }catch(err){ console.warn(err);announce('Não foi possível salvar automaticamente. Baixe o projeto JSON.');if(withMessage)E.showToast('Use Salvar projeto (.json) para guardar o arquivo.',true); }
  }
  async function recoverDraft() {
    try {
      const saved=await draft('get');
      if(!saved?.state)return;
      if (!window.confirm('Encontramos um rascunho salvo neste computador. Deseja continuar sua edição?')) return;
      restoring=true;
      await apply(saved.state);
      history.length=0;history.push(snapshot());cursor=0;savedHash=history[0];
      E.showToast('Sua edição anterior foi recuperada.');
      announce('Rascunho recuperado • salvo neste computador');
    } catch(err){console.warn('Não foi possível recuperar rascunho:',err);}finally{restoring=false;refreshButtons();}
  }
  document.addEventListener('keydown',event=>{
    const mod=event.ctrlKey||event.metaKey, k=event.key.toLowerCase();
    if(mod && k==='s') {event.preventDefault();event.stopImmediatePropagation();$('save-editable').click();return;}
    if(isEditableText())return;
    if(mod && k==='z') {event.preventDefault();event.stopImmediatePropagation();event.shiftKey?redo():undo();return;}
    if(mod && k==='y') {event.preventDefault();event.stopImmediatePropagation();redo();return;}
    if(mod && k==='c') {event.preventDefault();event.stopImmediatePropagation();copy();return;}
    if(mod && k==='x') {event.preventDefault();event.stopImmediatePropagation();cut();return;}
    if(mod && k==='v' && clipboard) {event.preventDefault();event.stopImmediatePropagation();void paste();return;}
    if(['Backspace','Delete'].includes(event.key) && selected()) {event.preventDefault();event.stopImmediatePropagation();deleteSelected();return;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) && selected()) {
      const step=event.shiftKey?10:2;
      obj().x+=(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0);
      obj().y+=(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);
      if(selected()==='foto')E.getPhotoMetrics();
      E.syncElementControls();E.redraw();refreshButtons();debouncedRecord(320);
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  // Alterações realizadas no painel original e carregamento assíncrono de arquivos.
  document.addEventListener('input',event=>{
    if(event.target.closest('#selection-inspector'))return;
    debouncedRecord(400);
  },true);
  document.addEventListener('change',event=>{
    if(event.target.closest('#selection-inspector'))return;
    setTimeout(()=>{refreshButtons();record();},event.target.type==='file'?450:90);
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('#selection-inspector, #editor-toolbar'))return;
    setTimeout(()=>{refreshButtons();record();},100);
  },true);
  const originalOptions=$('element-select');
  new MutationObserver(()=>{setTimeout(()=>{refreshButtons();record();},120);})
    .observe(originalOptions,{childList:true});
  history.push(snapshot());cursor=0;state.hidden ||= [];
  refreshButtons();
  setTimeout(()=>void recoverDraft(),550);
})();
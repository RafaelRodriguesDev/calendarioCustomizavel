/* Grace Fotografia: revisão dos recortes ANTES de importar à biblioteca. */
(() => {
  'use strict';
  const html = `<div class="sprite-modal" id="sprite-preview-modal" hidden>
    <div class="sprite-modal-backdrop" data-close="1"></div>
    <section class="sprite-dialog" role="dialog" aria-modal="true" aria-labelledby="sprite-dialog-title">
      <header class="sprite-dialog-head"><div><div class="eyebrow">IMPORTAR ELEMENTOS</div><h2 id="sprite-dialog-title">Confira os recortes</h2><p id="sprite-dialog-file"></p></div><button class="sprite-modal-x" type="button" id="sprite-modal-close" aria-label="Fechar">×</button></header>
      <div class="sprite-dialog-settings">
        <label>Fundo <select id="preview-mode"><option value="auto">Automático</option><option value="branco">Branco</option><option value="transparente">Transparente</option><option value="cantos">Pelas bordas</option><option value="cor">Cor escolhida</option></select></label>
        <label id="preview-color-wrap" hidden>Cor <input id="preview-color" type="color" value="#ffffff"></label>
        <label>Tolerância <input id="preview-tolerance" type="range" min="12" max="110" value="45"><output id="preview-tolerance-value">45</output></label>
        <label>Detalhes <select id="preview-minimum"><option value="0.01">Pequenos</option><option value="0.025">Padrão</option><option value="0.1">Médios</option><option value="0.5">Grandes</option></select></label>
        <button id="preview-recheck" type="button" class="btn secondary small">↻ Recalcular</button>
      </div>
      <div class="sprite-review-summary"><strong id="sprite-review-count">Analisando imagem…</strong><span>Desmarque as peças que não quiser guardar.</span></div>
      <div class="sprite-review-gallery" id="sprite-review-gallery" aria-live="polite"></div>
      <footer class="sprite-modal-footer"><span id="sprite-review-status" role="status">Preparando prévia…</span><div><button type="button" class="btn tertiary" id="sprite-modal-cancel">Cancelar</button><button type="button" class="btn primary" id="sprite-modal-confirm" disabled>Separar elementos</button></div></footer>
    </section>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
  const $=id=>document.getElementById(id);
  const modal=$('sprite-preview-modal');
  let closeModal=()=>{};
  $('sprite-modal-close').addEventListener('click',()=>closeModal());
  $('sprite-modal-cancel').addEventListener('click',()=>closeModal());
  modal.querySelector('.sprite-modal-backdrop').addEventListener('click',()=>closeModal());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden){e.preventDefault();closeModal();}});
  $('preview-mode').addEventListener('change',()=>{$('preview-color-wrap').hidden=$('preview-mode').value!=='cor';});
  $('preview-tolerance').addEventListener('input',e=>$('preview-tolerance-value').textContent=e.target.value);
  async function preview(file,initial={}){
    if(!file)return null;
    const old=document.activeElement;
    modal.hidden=false;
    document.body.classList.add('sprite-modal-open');
    $('sprite-dialog-file').textContent=file.name;
    $('preview-mode').value=initial.mode||'auto';
    $('preview-color').value=initial.color||'#ffffff';
    $('preview-color-wrap').hidden=$('preview-mode').value!=='cor';
    $('preview-tolerance').value=initial.tolerance||45;
    $('preview-tolerance-value').textContent=$('preview-tolerance').value;
    $('preview-minimum').value=String(initial.minimum??.025);
    $('sprite-review-gallery').replaceChildren();
    $('sprite-review-status').textContent='Analisando a imagem…';
    $('sprite-modal-confirm').disabled=true;
    $('sprite-modal-close').focus();
    let result=null, workId=0, finished=false;
    let resolve;
    const promise=new Promise(done=>resolve=done);
    function finish(value){
      if(finished)return;
      finished=true;workId++;
      modal.hidden=true;document.body.classList.remove('sprite-modal-open');
      $('preview-recheck').onclick=null;$('sprite-modal-confirm').onclick=null;
      closeModal=()=>{};
      if(old?.focus)old.focus();
      resolve(value);
    }
    closeModal=()=>finish(null);
    async function recalculate(){
      const token=++workId;
      $('preview-recheck').disabled=true;
      $('sprite-modal-confirm').disabled=true;
      $('sprite-review-gallery').replaceChildren();
      $('sprite-review-count').textContent='Analisando imagem…';
      $('sprite-review-status').textContent='Removendo fundo e identificando os adornos…';
      await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,10)));
      try {
        const processed=await window.SpriteSheetTools.extract(file,{
          mode:$('preview-mode').value,color:$('preview-color').value,
          tolerance:Number($('preview-tolerance').value),minimum:Number($('preview-minimum').value)
        });
        if(finished||token!==workId)return;
        result=processed;
        const gallery=$('sprite-review-gallery');
        if(!processed.items.length){
          const p=document.createElement('p');p.className='sprite-review-empty';p.textContent='Nenhuma peça encontrada. Ajuste o tipo de fundo ou a tolerância e clique em Recalcular.';gallery.append(p);
        }
        processed.items.forEach((item,i)=>{
          const label=document.createElement('label');label.className='sprite-review-tile';
          const check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.index=String(i);check.addEventListener('change',updateCount);
          const img=document.createElement('img');img.src=item.src;img.alt=`Peça ${i+1}`;img.loading='lazy';
          const caption=document.createElement('span');caption.textContent=`Elemento ${String(i+1).padStart(2,'0')}`;
          label.append(check,img,caption);gallery.append(label);
        });
        $('sprite-review-status').textContent=`Prévia de ${processed.items.length} elemento(s), sem salvar ainda.`;
        updateCount();
      }catch(err){
        if(token!==workId||finished)return;
        $('sprite-review-count').textContent='Não foi possível analisar';
        $('sprite-review-status').textContent=err.message;
        const p=document.createElement('p');p.className='sprite-review-empty';p.textContent=err.message;$('sprite-review-gallery').append(p);
      }finally{if(token===workId&&!finished)$('preview-recheck').disabled=false;}
    }
    function updateCount(){
      const n=modal.querySelectorAll('.sprite-review-tile input:checked').length;
      $('sprite-review-count').textContent=`${n} de ${result?.items.length||0} elementos selecionados`;
      $('sprite-modal-confirm').disabled=!n;
      $('sprite-modal-confirm').textContent=n?`Separar ${n} elemento(s)`:'Separar elementos';
    }
    $('preview-recheck').onclick=recalculate;
    $('sprite-modal-confirm').onclick=()=>{
      if(!result)return;
      const chosen=new Set([...modal.querySelectorAll('.sprite-review-tile input:checked')].map(x=>Number(x.dataset.index)));
      if(!chosen.size)return;
      finish({...result,items:result.items.filter((_,i)=>chosen.has(i))});
    };
    void recalculate();
    return promise;
  }
  window.GraceSpritePreview={preview};
})();
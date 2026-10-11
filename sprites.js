/*
 * Recorte de sprite sheets totalmente no navegador, sem APIs remotas.
 * Etapas: transparência/cor de fundo -> preenchimento a partir das bordas ->
 * componentes conectados -> PNG individual com transparência.
 */
(() => {
  'use strict';
  const near = (a,b) => Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2);
  const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
  const waitImage = async file => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw Error('Envie uma imagem PNG, JPG ou WebP.');
    const url=URL.createObjectURL(file);
    try {
      const im=new Image();
      await new Promise((yes,no)=>{im.onload=yes;im.onerror=()=>no(Error('Não foi possível abrir o sprite sheet.'));im.src=url;});
      if (im.width < 24 || im.height < 24) throw Error('A imagem é pequena demais para o recorte automático.');
      return im;
    } finally { // The image pixels are decoded by canvas before revoking, in modern browsers.
      URL.revokeObjectURL(url);
    }
  };
  function maskAndCrop(data,width,height,opts) {
    const tolerance=clamp(Number(opts.tolerance)||42,10,140);
    const minPct=clamp(Number(opts.minimum)||.025,.005,5);
    const pixels=width*height,alphaStats={transparent:0};
    for (let y=0;y<height;y+=Math.max(1,Math.floor(height/40))) for(let x=0;x<width;x+=Math.max(1,Math.floor(width/40))) {
      if (data[(y*width+x)*4+3]<35) alphaStats.transparent++;
    }
    const alreadyTransparent = (opts.mode==='auto'||opts.mode==='transparente') && alphaStats.transparent>35;
    const mode=opts.mode==='auto'?(alreadyTransparent?'transparente':'branco'):opts.mode;
    const transparency = mode==='transparente';
    const border = [0,width-1,(height-1)*width,height*width-1].map(pos=>[data[pos*4],data[pos*4+1],data[pos*4+2]]);
    const chosen = String(opts.color || '#ffffff');
    const custom = chosen.match(/^#([a-fA-F\d]{6})$/) ? [1,3,5].map(i=>parseInt(chosen.slice(i,i+2),16)):[255,255,255];
    // Bilinear interpolation of the corner colors compensates for smoothly graded backgrounds.
    const bgAt = (x,y) => {
      if (mode==='branco') return [255,255,255];
      if (mode==='cor') return custom;
      const fx=x/Math.max(1,width-1),fy=y/Math.max(1,height-1);
      return [0,1,2].map(c => (1-fy)*((1-fx)*border[0][c]+fx*border[1][c])+fy*((1-fx)*border[2][c]+fx*border[3][c]));
    };
    // Foreground is 1; pixels recognized as removable background are 0.
    const fg=new Uint8Array(pixels);
    if (transparency) {
      for(let i=0;i<pixels;i++) fg[i]=data[i*4+3]>=42?1:0;
    } else {
      const visited=new Uint8Array(pixels),stack=new Int32Array(pixels);let sp=0;
      const candidate=i=>{
        const p=i*4;if(data[p+3]<32)return true;
        const x=i%width,y=(i/width)|0;
        return near([data[p],data[p+1],data[p+2]],bgAt(x,y))<=tolerance;
      };
      const seed=i=>{if(!visited[i]&&candidate(i)){visited[i]=1;stack[sp++]=i;}};
      for(let x=0;x<width;x++){seed(x);seed((height-1)*width+x);}
      for(let y=0;y<height;y++){seed(y*width);seed(y*width+width-1);}
      while(sp){
        const i=stack[--sp],x=i%width,y=(i/width)|0;
        if(x>0)seed(i-1);if(x<width-1)seed(i+1);
        if(y>0)seed(i-width);if(y<height-1)seed(i+width);
      }
      for(let i=0;i<pixels;i++)fg[i]=visited[i]?0:1;
    }
    // Build an alpha-matted result; only background reachable from canvas edges is erased.
    const out=new Uint8ClampedArray(data);
    for(let i=0;i<pixels;i++){
      const a=i*4;
      if(!fg[i]){out[a+3]=0;continue;}
      if(transparency)continue;
      const x=i%width,y=(i/width)|0;
      const edge=(x>0&&!fg[i-1])||(x<width-1&&!fg[i+1])||(y>0&&!fg[i-width])||(y<height-1&&!fg[i+width]);
      if(edge){const d=near([data[a],data[a+1],data[a+2]],bgAt(x,y));const opacity=clamp((d-tolerance*.72)/Math.max(1,tolerance*.7),.15,1);out[a+3]=Math.round(out[a+3]*opacity);}
    }
    // Iterative 8-connected component labeling avoids recursion / stack overflows.
    const seen=new Uint8Array(pixels),stack=new Int32Array(pixels),pieces=[];
    const minPixels=Math.max(45,Math.floor(pixels*minPct/100));
    for(let i=0;i<pixels;i++){
      if(seen[i]||!fg[i])continue;
      let sp=0,count=0,minx=width,miny=height,maxx=0,maxy=0;
      stack[sp++]=i;seen[i]=1;
      while(sp){
        const j=stack[--sp],x=j%width,y=(j/width)|0;
        ++count;minx=Math.min(x,minx);maxx=Math.max(x,maxx);miny=Math.min(y,miny);maxy=Math.max(y,maxy);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;
          if(nx<0||ny<0||nx>=width||ny>=height)continue;
          const ni=ny*width+nx;
          if(fg[ni]&&!seen[ni]){seen[ni]=1;stack[sp++]=ni;}
        }
      }
      const w=maxx-minx+1,h=maxy-miny+1;
      if(count>=minPixels&&w>=9&&h>=9) pieces.push({x:minx,y:miny,w,h,count});
    }
    pieces.sort((a,b)=>a.y-b.y||a.x-b.x);
    const selected=pieces.slice(0,120);
    return {out,regions:selected,total:pieces.length,mode};
  }
  async function extract(file, opts={}) {
    const img=await waitImage(file);
    const scale=Math.min(1,2600/Math.max(img.width,img.height),Math.sqrt(6500000/(img.width*img.height)));
    const width=Math.round(img.width*scale),height=Math.round(img.height*scale);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('Seu navegador não suporta o processamento de imagens.');
    ctx.clearRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
    const im=ctx.getImageData(0,0,width,height);
    const {out,regions,total,mode}=maskAndCrop(im.data,width,height,opts);
    const items=[];
    for(let i=0;i<regions.length;i++){
      const r=regions[i];
      const crop=document.createElement('canvas');crop.width=r.w+4;crop.height=r.h+4;
      const cropCtx=crop.getContext('2d');
      const part=cropCtx.createImageData(r.w,r.h);
      for(let y=0;y<r.h;y++){
        const offset=((r.y+y)*width+r.x)*4;
        part.data.set(out.subarray(offset,offset+r.w*4),y*r.w*4);
      }
      cropCtx.putImageData(part,2,2);
      items.push({name:`${file.name.replace(/\.[^.]+$/,'')} • peça ${String(i+1).padStart(2,'0')}`,src:crop.toDataURL('image/png'),w:crop.width,h:crop.height});
    }
    return {items,total,width,height,mode};
  }
  window.SpriteSheetTools={extract};
})();
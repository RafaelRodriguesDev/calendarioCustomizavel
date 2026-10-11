/* Modulo de exportacao offline, Grace Fotografia */
(()=>{
'use strict';
  function crc32(bytes){
    let crc=0xffffffff;
    for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    return(crc^0xffffffff)>>>0;
  }
  function addPngDpi(blob,dpi){
    // PNG pHYs chunk: physical print size is written in pixels per metre.
    return blob.arrayBuffer().then(buffer=>{
      const src=new Uint8Array(buffer);
      const ppm=Math.round(dpi/0.0254),payload=new Uint8Array(9),view=new DataView(payload.buffer);
      view.setUint32(0,ppm);view.setUint32(4,ppm);payload[8]=1;
      const type=new TextEncoder().encode('pHYs');
      const chk=new Uint8Array(21);const dv=new DataView(chk.buffer);
      dv.setUint32(0,9);chk.set(type,4);chk.set(payload,8);
      dv.setUint32(17,crc32(chk.slice(4,17)));
      // Insert immediately after PNG signature + IHDR chunk (normally offset 33).
      let offset=8;
      if(src.length<33)throw Error('PNG inválido.');
      const ihdrSize=new DataView(src.buffer).getUint32(offset);
      offset+=12+ihdrSize;
      return new Blob([src.slice(0,offset),chk,src.slice(offset)],{type:'image/png'});
    });
  }
  function pdfFromJpeg(jpeg,pxW,pxH,paper){
    // Tiny standards-compliant PDF 1.4 writer with a single embedded RGB JPEG.
    // Works offline without external libraries or a network connection.
    const page=paper==='A3'?[297,420]:[210,297];
    const pw=(page[0]*72/25.4).toFixed(4),ph=(page[1]*72/25.4).toFixed(4);
    const enc=new TextEncoder();
    const byte=s=>enc.encode(s);
    const pieces=[],offsets=[0];let size=0;
    const push=v=>{pieces.push(v);size+=v.length;};
    push(byte('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    const obj=(num,segments)=>{offsets[num]=size;push(byte(`${num} 0 obj\n`));segments.forEach(push);push(byte('\nendobj\n'));};
    obj(1,[byte('<< /Type /Catalog /Pages 2 0 R >>')]);
    obj(2,[byte('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);
    obj(3,[byte(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`)]);
    obj(4,[byte(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,byte('\nendstream')]);
    const commands=byte(`q\n${pw} 0 0 ${ph} 0 0 cm\n/Im1 Do\nQ\n`);
    obj(5,[byte(`<< /Length ${commands.length} >>\nstream\n`),commands,byte('endstream')]);
    const startXref=size;
    push(byte('xref\n0 6\n0000000000 65535 f \n'));
    for(let i=1;i<=5;i++)push(byte(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`));
    push(byte(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`));
    return new Blob(pieces,{type:'application/pdf'});
  }
  window.GraceExport={addPngDpi,pdfFromJpeg};
})();

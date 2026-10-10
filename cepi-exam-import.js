(() => {
  'use strict';

  function splitQuestions(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n');
    const questions = [];
    let current = null;
    const heading = /^\s*(?:(?:quest[aã]o|q)\s*0*([1-9]\d{0,2})\s*[.):\-]?\s*(.*)|0*([1-9]\d{0,2})\s*[.):\-]\s+(.*))$/i;
    for (const line of lines) {
      if (/^\s*(?:gabarito|respostas\s+corretas)\b/i.test(line) && questions.length) break;
      const match = line.match(heading);
      if (match) {
        if (current) questions.push({...current, statement:current.lines.join('\n').trim()});
        current = {printedNumber:Number(match[1] || match[3]),lines:[match[2] || match[4] || '']};
      } else if (current) current.lines.push(line);
    }
    if (current) questions.push({...current, statement:current.lines.join('\n').trim()});
    if (questions.length < 1 || questions.length > 99 || questions.some((q,index) => q.printedNumber !== questions[0].printedNumber + index || q.statement.length < 3 || q.statement.length > 30000)) {
      throw new Error('Não foi possível separar questões consecutivas. Confira a numeração e o texto extraído antes de importar.');
    }
    return questions.map(({printedNumber,statement},index) => ({number:index+1,printedNumber,statement}));
  }

  let mammothPromise;
  function mammothLibrary() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    mammothPromise ||= new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src=new URL('vendor/cepi-import/mammoth.browser.min.js',document.baseURI).href;
      script.onload=()=>window.mammoth?resolve(window.mammoth):reject(new Error('Não foi possível abrir o leitor de Word.'));
      script.onerror=()=>reject(new Error('Não foi possível carregar o leitor de Word.'));
      document.head.appendChild(script);
    });
    return mammothPromise;
  }

  async function extractText(file) {
    if (!(file instanceof File) || file.size > 15000000) throw new Error('Escolha um arquivo Word, PDF ou TXT de até 15 MB.');
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension === 'txt') return file.text();
    const data = await file.arrayBuffer();
    if (extension === 'docx') {
      const mammoth=await mammothLibrary();
      const result=await mammoth.extractRawText({arrayBuffer:data});
      return result.value;
    }
    if (extension === 'pdf') {
      const pdfjs=await import(new URL('vendor/cepi-import/pdf.min.mjs',document.baseURI).href);
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/cepi-import/pdf.worker.min.mjs',document.baseURI).href;
      const task=pdfjs.getDocument({data:new Uint8Array(data)});
      const documentPdf=await task.promise;
      try {
        const pages=[];
        for (let pageNumber=1;pageNumber<=documentPdf.numPages;pageNumber++) {
          const page=await documentPdf.getPage(pageNumber);
          const content=await page.getTextContent();
          pages.push(content.items.map(item => `${item.str || ''}${item.hasEOL?'\n':' '}`).join(''));
        }
        const text=pages.join('\n');
        if (text.trim().length < 20) throw new Error('Este PDF não contém texto selecionável. Para uma prova digitalizada, use um arquivo com OCR ou cole o texto das questões.');
        return text;
      } finally { await task.destroy(); }
    }
    throw new Error('Formato não aceito. Use .docx, .pdf ou .txt.');
  }

  const api={splitQuestions,extractText};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  if (typeof window !== 'undefined') window.CepiExamImport=api;
})();

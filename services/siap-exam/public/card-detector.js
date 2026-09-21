/* Local framing detector only. It never assigns alternatives or calculates scores. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SiapCardDetector=api;})(globalThis,function(){
  function inspect(rgba,width,height,expected=0){
    const size=width*height,gray=new Uint8Array(size),hist=new Uint32Array(256);
    for(let i=0;i<size;i++){const j=i*4,v=Math.round((rgba[j]*299+rgba[j+1]*587+rgba[j+2]*114)/1000);gray[i]=v;hist[v]++;}
    let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
    let count=0,partial=0,best=0,threshold=110;
    for(let i=0;i<256;i++){count+=hist[i];if(!count||count===size)continue;partial+=i*hist[i];const score=count*(size-count)*(partial/count-(sum-partial)/(size-count))**2;if(score>best){best=score;threshold=i;}}
    if(best/size/size<150)return {ready:false,gray,reason:'Aproxime a folha e melhore a iluminação.'};
    threshold=Math.min(190,Math.max(45,threshold+12));
    const candidates=[],circles=[];
    // A dark circular rim with lighter pixels just outside. No answer reading.
    for(let radius=5;radius<=18;radius+=2){
      const samples=Array.from({length:12},(_,i)=>{const angle=i*Math.PI/6;return [Math.round(Math.cos(angle)*radius),Math.round(Math.sin(angle)*radius),Math.round(Math.cos(angle)*(radius+3)),Math.round(Math.sin(angle)*(radius+3))];});
      for(let y=radius+4;y<height-radius-4;y+=3)for(let x=radius+4;x<width-radius-4;x+=3){
        let hits=0,contrast=0;
        for(const [dx,dy,ox,oy] of samples){const outer=gray[(y+oy)*width+x+ox],rim=Math.min(gray[(y+dy)*width+x+dx],gray[(y+dy)*width+x+dx+1],gray[(y+dy+1)*width+x+dx]);if(outer-rim>22){hits++;contrast+=outer-rim;}}
        if(hits>=9)candidates.push({x,y,d:radius*2,score:contrast});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    for(const c of candidates)if(!circles.some(p=>Math.hypot(p.x-c.x,p.y-c.y)<Math.min(p.d,c.d)*.6))circles.push(c);
    circles.sort((a,b)=>a.x-b.x);
    const runs=[];
    for(const c of circles)for(const second of circles){
      const gap=second.x-c.x,slope=(second.y-c.y)/gap;
      if(gap<c.d*.95||gap>c.d*2.2||Math.abs(slope)>.22||Math.abs(second.d-c.d)>c.d*.3)continue;
      const row=[c,second];
      for(let k=2;k<4;k++){const expectedX=c.x+gap*k,expectedY=c.y+(second.y-c.y)*k;const p=circles.find(p=>Math.abs(p.x-expectedX)<gap*.18&&Math.abs(p.y-expectedY)<c.d*.3&&Math.abs(p.d-c.d)<c.d*.3);if(p)row.push(p);}
      if(row.length!==4)continue;
      if(runs.some(r=>Math.abs(r.y-c.y)<c.d*.65&&Math.abs(r.x-c.x)<gap*2))continue;
      runs.push({x:c.x,y:c.y,d:c.d,gap,right:row[3].x});
    }
    const groups=[];
    for(const run of runs){let group=groups.find(g=>Math.abs(g.x-run.x)<run.gap*.6&&Math.abs(g.gap-run.gap)<run.gap*.3);if(!group){group={x:run.x,gap:run.gap,rows:[]};groups.push(group);}group.rows.push(run);}
    const blocks=groups.filter(g=>g.rows.length>=6).sort((a,b)=>a.x-b.x);
    const total=blocks.reduce((n,g)=>n+g.rows.length,0);
    const target=expected||(total>=12&&total<=16?15:total>=30&&total<=42?40:0);
    if(!target||total<target*.5||total>target*1.1)return {ready:false,gray,reason:'Enquadre o cartão inteiro, com todas as marcações.'};
    for(const g of blocks){g.rows.sort((a,b)=>a.y-b.y);const gaps=g.rows.slice(1).map((r,i)=>r.y-g.rows[i].y),mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;if(gaps.some(v=>v<mean*.55||v>mean*2.6))return {ready:false,gray,reason:'Alinhe a folha e evite cortes.'};}
    const points=blocks.flatMap(g=>g.rows);
    if(points.some(p=>p.x<width*.025||p.right>width*.975||p.y<height*.025||p.y>height*.975))return {ready:false,gray,reason:'Afaste um pouco para incluir as bordas.'};
    return {ready:true,gray,rows:total,reason:'Cartão identificado. Mantenha o celular parado…'};
  }
  function motion(a,b){if(!a||!b||a.length!==b.length)return Infinity;let sum=0,n=0;for(let i=0;i<a.length;i+=16){sum+=Math.abs(a[i]-b[i]);n++;}return sum/n;}
  return {inspect,motion};
});

if(typeof WorkerGlobalScope!=='undefined' && self instanceof WorkerGlobalScope){
 let previous=null,stable=0;
 self.onmessage=event=>{try{const {buffer,width,height,expected}=event.data;const result=self.SiapCardDetector.inspect(new Uint8ClampedArray(buffer),width,height,expected);const still=self.SiapCardDetector.motion(previous,result.gray)<4;previous=result.gray;stable=result.ready&&still?stable+1:0;self.postMessage({ready:result.ready,capture:stable>=3,reason:result.reason});}catch{self.postMessage({capture:false,reason:'Ajuste o enquadramento ou toque em Ler agora.'});}};
}

// ワールドマップ — the archipelago, drawn.
//
// The map is a view of the world, not the world: two islands can be neighbours out
// there and still need to be told apart in here. So the projection is where a place
// *starts* on the canvas, and then a short relaxation pass pushes the labelled islands
// apart until none of them overlaps. Relative positions survive — north stays north,
// and the flight lines still run between the right pairs — but nothing is hidden under
// anything else, at any canvas size, however many islands the archipelago grows.
import {DESTINATIONS,REGIONS,REGION_BY_ID} from './rpg-data.js';

// The world, as sea chart coordinates.
const project=(r,w,h)=>({x:(r.x+400)/860*w,y:(r.z+470)/920*h});

// How much room one island needs: its own blob, and the two lines of label under it.
// The label is usually the wider of the two, so it is what decides the box.
//
// Islands shrink as the archipelago grows: what has to fit in the panel is every island
// at once, so the size of one is a function of how many there are and how big the canvas
// is. Below that they would be dots, so there is a floor.
function fit(count,w,h){
 const cell=Math.sqrt((w*h)/(count*3.6));
 return Math.max(.42,Math.min(1,cell/86));
}

function footprint(r,w,h,scale,font){
 const rx=(r.hub?Math.min(w*.062,42):Math.min(w*.076,52))*scale;
 const ry=(r.hub?Math.min(h*.055,31):Math.min(h*.068,41))*scale;
 const title=r.id==='park'?'テーマパーク':r.name;
 const label=title.length*font*.62;
 return {rx,ry,hw:Math.max(rx*1.08+7,label/2+4),top:ry*1.08+6,bottom:ry*1.08+(r.hub?22:34)};
}

// Push the boxes apart along whichever axis they overlap least, then let each one drift
// back towards where it really is. A few hundred cheap passes settle into a layout that
// is both readable and still recognisably the map.
function relax(nodes,w,h){
 const margin=10;
 for(let pass=0;pass<700;pass++){
  let worst=0;
  for(let a=0;a<nodes.length;a++){
   for(let b=a+1;b<nodes.length;b++){
    const A=nodes[a],B=nodes[b];
    const dx=B.x-A.x,dy=B.y-A.y;
    const ox=(A.hw+B.hw)-Math.abs(dx);
    if(ox<=0)continue;
    const oy=Math.min(A.y+A.bottom,B.y+B.bottom)-Math.max(A.y-A.top,B.y-B.top);
    if(oy<=0)continue;
    worst=Math.max(worst,Math.min(ox,oy));
    // Push on both axes at once, weighted towards the shallower one. Choosing only the
    // shallower axis makes two boxes flip between x and y forever without ever parting.
    const sx=dx<0?-1:1,sy=dy<0?-1:1;
    if(pass<600){
     const total=ox+oy;
     const mx=ox*.52*(oy/total),my=oy*.52*(ox/total);
     A.x-=sx*mx;B.x+=sx*mx;
     A.y-=sy*my;B.y+=sy*my;
    }else if(ox<oy){A.x-=sx*ox*.5;B.x+=sx*ox*.5}       // and a last clean-up along the
    else{A.y-=sy*oy*.5;B.y+=sy*oy*.5}                  // shallower axis, once settled
   }
  }
  // The spring home keeps the archipelago's shape; it is weak enough that it never
  // undoes a separation, and it stops after the layout has settled.
  const pull=pass<260?.04:0;
  for(const n of nodes){
   if(pull){n.x+=(n.x0-n.x)*pull;n.y+=(n.y0-n.y)*pull}
   n.x=Math.min(w-n.hw-margin,Math.max(n.hw+margin,n.x));
   n.y=Math.min(h-n.bottom-margin,Math.max(n.top+margin+14,n.y));
  }
  if(!worst&&!pull)break;
 }
 return nodes;
}

// Where every island sits on a canvas of this size, boxes and all. Exported so the
// regression suite can walk it: two labels on top of each other is the one bug this file
// can have, and it is invisible to every other test.
export function worldMapLayout(w,h){
 const scale=fit(DESTINATIONS.length,w,h);
 const font=w<450?10:12;
 return relax(DESTINATIONS.map((r,index)=>{const p=project(r,w,h);return {r,id:r.id,index,x:p.x,y:p.y,x0:p.x,y0:p.y,...footprint(r,w,h,scale,font)}}),w,h);
}

export function drawWorldMap(canvas,{store,current,selected}){
 const rect=canvas.getBoundingClientRect(),w=Math.max(340,rect.width||640),h=Math.max(380,rect.height||590),ratio=Math.min(globalThis.devicePixelRatio||1,2);
 canvas.width=w*ratio;canvas.height=h*ratio;
 const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
 const nodes=worldMapLayout(w,h);
 const at=new Map(nodes.map(n=>[n.r.id,n]));
 const hits=[];

 const sea=ctx.createLinearGradient(0,0,w,h);sea.addColorStop(0,'#2d6a7b');sea.addColorStop(1,'#194757');ctx.fillStyle=sea;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#b5e2dd10';ctx.lineWidth=1;
 for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
 for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
 ctx.font='10px sans-serif';ctx.fillStyle='#c2dace70';ctx.fillText('U-SPEAK ARCHIPELAGO',18,25);ctx.textAlign='right';ctx.fillText('N ↑',w-20,25);

 // The air routes, between the islands where they now sit.
 for(const n of nodes){
  for(const parent of n.r.needs||[]){
   const a=at.get(REGION_BY_ID[parent]?.id);
   if(!a)continue;
   ctx.beginPath();ctx.setLineDash([4,5]);
   ctx.lineWidth=store.unlocked(n.r.id)?1.8:1;
   ctx.strokeStyle=store.unlocked(n.r.id)?'#f2dc9f99':'#bbd4d12a';
   ctx.moveTo(a.x,a.y);ctx.lineTo(n.x,n.y);ctx.stroke();
  }
 }
 ctx.setLineDash([]);

 for(const n of nodes){
  const {r,index,rx,ry}=n,p={x:n.x,y:n.y};
  const isOpen=store.unlocked(r.id),isSelected=selected===r.id;
  hits.push({id:r.id,x:p.x,y:p.y,r:Math.max(rx,ry)+8});
  const shape=(scale,offset=0)=>{ctx.beginPath();for(let j=0;j<=40;j++){const a=j/40*Math.PI*2,noise=1+.12*Math.sin(a*5+index*2)+.07*Math.cos(a*9+index);const x=p.x+Math.cos(a)*rx*noise*scale,y=p.y+Math.sin(a)*ry*noise*scale+offset;j?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath()};
  shape(1.08);ctx.fillStyle=isSelected?'#e9d79e':'#a6c8c233';ctx.fill();
  shape(1);ctx.fillStyle=isOpen?'#d4bd8d':'#66838a';ctx.fill();
  shape(.88);ctx.fillStyle=isOpen?'#'+r.color.toString(16).padStart(6,'0'):'#526e77';ctx.fill();
  ctx.strokeStyle=isOpen?'#fff3ca99':'#ccddd555';ctx.lineWidth=isSelected?2:1;ctx.stroke();
  ctx.save();shape(.83);ctx.clip();
  for(let j=0;j<6;j++){shape(.7-j*.08,(j-2)*2);ctx.strokeStyle=isOpen?'#29493828':'#bacfcb0c';ctx.lineWidth=1;ctx.stroke()}
  ctx.restore();
  if(isSelected){ctx.beginPath();ctx.arc(p.x,p.y,18,0,Math.PI*2);ctx.strokeStyle='#fff0b4';ctx.lineWidth=2;ctx.stroke()}
  ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);
  ctx.fillStyle=r.id===current?'#fff2cc':isOpen?'#244a53':'#45616b';ctx.fill();
  ctx.strokeStyle=isOpen?'#e5d5ac':'#7e9897';ctx.lineWidth=1.5;ctx.stroke();
  ctx.font='600 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=r.id===current?'#28565c':isOpen?'#f6e7bc':'#bac9c1';
  ctx.fillText(r.id===current?'●':r.hub?'✈':isOpen?(store.cleared(r.id)?'✓':String(REGIONS.indexOf(r)+1).padStart(2,'0')):'?',p.x,p.y);
  ctx.font=`600 ${w<450?10:12}px sans-serif`;ctx.lineWidth=4;ctx.strokeStyle='#204451';
  const title=r.id==='park'?'テーマパーク':r.name;
  ctx.strokeText(title,p.x,p.y+ry+14);ctx.fillStyle=isOpen?'#fff0cf':'#adc3bd';ctx.fillText(title,p.x,p.y+ry+14);
  if(!r.hub){ctx.font='9px sans-serif';ctx.fillStyle=isOpen?'#e9e1bf':'#a1bcb7';ctx.fillText(isOpen?`${store.count(r.id)} / 10`:'未解放',p.x,p.y+ry+28)}
 }
 ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#d5dfcbab';ctx.font='10px sans-serif';
 ctx.fillText('地域を選択して航空路を確認',18,h-17);
 return {hits,width:w,height:h};
}

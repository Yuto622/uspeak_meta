// 海と 入り江の 水（2026-11：「水も リアルに。でも 重く ならない ように」）。
//
// ・絵（テクスチャ）も 2 回目の 描画（うつりこみ用の カメラ）も 使わない：波の かたむきは 式（sin の 足しあわせ）、空の うつりこみは 色の 式。
//   1 画素の 計算は 前の 海と ほぼ 同じ 量。頂点は 前より へらした（180×180 → 96×96）。
// ・ゆれる 波・ななめから 見ると 空が うつる（フレネル）・太陽の きらめき・浅い ところの 光の あみ（コースティクス）・岸の 泡。
// ・時間・夜・太陽は 1 つの 入れ物（SEA）を みんなで 使う：atmosphere.js が 毎フレーム 書く。入り江や 池は `seaMaterial({ shallow: 1 })`。
import * as THREE from './three.module.js';

export const SEA = { uTime: { value: 0 }, uNight: { value: 0 }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3) } };

const VERT = `uniform float uTime;uniform float uAmp;varying vec3 vWorld;
void main(){vec3 p=position;vec4 w0=modelMatrix*vec4(p,1.);vec2 q=w0.xz;
float h=sin(q.x*.32+uTime*.75)*.10+cos(q.y*.25+uTime*.55)*.13+sin(q.x*.7+q.y*.38+uTime)*.035;
vec4 w=w0;w.y+=h*uAmp;vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;

const FRAG = `precision highp float;uniform float uTime;uniform float uNight;uniform vec3 uSun;uniform float uShallow;uniform float uShore;varying vec3 vWorld;
// 波の かたむき：向きと こまかさの ちがう 波を 6 本。さいごの 2 本は きらめき用の こまかい 波。
vec2 slope(vec2 p,float t){vec2 s=vec2(0.);
 s+=vec2(.32,0.)*cos(p.x*.32+t*.75)*.10;
 s+=vec2(0.,.25)*-sin(p.y*.25+t*.55)*.13;
 s+=vec2(.7,.38)*cos(p.x*.7+p.y*.38+t)*.035;
 s+=vec2(1.3,-.9)*cos(p.x*1.3-p.y*.9+t*1.4)*.022;
 s+=vec2(-2.1,1.7)*cos(-p.x*2.1+p.y*1.7+t*1.9)*.011;
 s+=vec2(3.7,2.9)*cos(p.x*3.7+p.y*2.9-t*2.6)*.006;
 s+=vec2(-5.3,6.1)*cos(-p.x*5.3+p.y*6.1+t*3.1)*.0032;
 return s;}
void main(){vec2 p=vWorld.xz;float t=uTime;
 vec2 sl=slope(p,t)*(1.-uShallow*.45);
 vec3 n=normalize(vec3(-sl.x,1.,-sl.y));
 vec3 v=normalize(cameraPosition-vWorld);
 float nv=max(dot(n,v),0.);
 float fres=.03+.97*pow(1.-nv,5.);
 // 水の 色：深い 青みどり → 浅い ところは 明るい エメラルド。
 vec3 deep=mix(vec3(.02,.24,.33),vec3(.008,.05,.11),uNight);
 vec3 shal=mix(vec3(.10,.58,.60),vec3(.03,.16,.24),uNight);
 vec3 body=mix(deep,shal,max(uShallow,nv*.35));
 // 浅い ところ：水の 底に おちる 光の あみ。
 float c1=sin(p.x*2.3+sin(p.y*1.9+t*.8)*1.3+t*.6),c2=sin(p.y*2.7+sin(p.x*1.6-t*.7)*1.2-t*.5);
 float caus=pow(max(0.,1.-abs(c1*c2)),7.)*(1.-uNight*.8);
 body+=vec3(.55,.85,.75)*caus*.22*uShallow;
 // 空の うつりこみ：水平線は 明るく、上は 青く。
 vec3 r=reflect(-v,n);float up=clamp(r.y,0.,1.);
 vec3 sky=mix(mix(vec3(.93,.84,.70),vec3(.42,.66,.90),pow(up,.55)),mix(vec3(.10,.14,.26),vec3(.02,.04,.10),up),uNight);
 vec3 col=mix(body,sky,fres);
 // 太陽（夜は 月）の きらめき：するどい 光と、ひろがった かがやき。
 vec3 l=normalize(mix(uSun,normalize(vec3(.38,.55,-.7)),uNight));
 float rl=max(dot(r,l),0.);
 vec3 glow=mix(vec3(1.25,.92,.55),vec3(.62,.76,1.),uNight);
 col+=glow*(pow(rl,420.)*2.2+pow(rl,38.)*.16);
 // 岸の 泡（海だけ）。
 if(uShore>.5){float edge=min(max(abs(p.x)-28.,abs(p.y)-24.),max(abs(p.x-135.)-36.,abs(p.y)-34.));float shoreline=(1.-smoothstep(0.,2.6,edge))*step(-.5,edge);float foam=smoothstep(.7,.98,sin(edge*4.-t*1.5+sin(p.x*.6)*.4));col=mix(col,mix(vec3(.82,.93,.86),vec3(.22,.40,.47),uNight),shoreline*foam*.65);}
 // 波がしらの 白い すじ（うすく）。
 float crest=smoothstep(.055,.085,length(sl))*(.5+.5*sin(p.x*1.1+p.y*.7+t*.9));
 col=mix(col,mix(vec3(.90,.97,.96),vec3(.25,.38,.48),uNight),crest*.10);
 float fog=1.-exp(-length(cameraPosition-vWorld)*.004);
 col=mix(col,mix(vec3(.80,.68,.53),vec3(.045,.085,.15),uNight),fog);
 gl_FragColor=vec4(col,1.);}`;

// shallow：0 ＝ 沖の 海、1 ＝ 入り江・池（明るい 色・光の あみ・波は おだやか）。shore：岸の 泡（U-Speak島と テーマパークの まわり＝海だけ）。
export function seaMaterial({ shallow = 0, shore = false, amp = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SEA, uShallow: { value: shallow }, uShore: { value: shore ? 1 : 0 }, uAmp: { value: amp } },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  });
}

// たいらな 水面（入り江・池）。x・z は まんなか、w・d は 大きさ。頂点は 少しだけ（波の 形は 色で 見せる）。
export function waterPatch(x, y, z, w, d, { shallow = 1 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, Math.max(2, Math.round(w / 3)), Math.max(2, Math.round(d / 3))), seaMaterial({ shallow, amp: 0.35 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
  return m;
}

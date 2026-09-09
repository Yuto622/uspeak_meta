import {REGION_BY_ID} from './rpg-data.js';
import {parkPosition} from './magic-data.js';
// Door coordinates are on the walkable side of the exterior collision footprint.
const building=(id,region,name,kind,x,z,service,dir=1)=>({id,region,name,kind,x,z,service,dir});
export const BUILDINGS=[
 ...Object.values(REGION_BY_ID).filter(r=>parkPosition(r.id)).map(r=>{const p=parkPosition(r.id);return building('park-'+r.id,r.id,'U-Speak park','park',p.x,p.z+3.15,'care')}),
 building('bakery','willow','Sunny Bakery','bakery',-12,-.85,'bakery'),
 building('inn','willow','Explorer’s Inn','inn',13,-2.85,'rest'),
 building('forest-house','willow','森の図書室','library',-22,-7.35,'reading'),
 building('garden-house','willow','旅人の家','home',20,-12.35,'greeting'),
 building('fish-market','willow','Fin & Coin','fish',-5.7,13.55,'bag',-1),
 building('gear-shop','willow','Tide & Thread','gear',7.5,14.55,'shop',-1),
 building('airport','park','U-Speak Air ターミナル','airport',157,28.25,'flight'),
 building('castle','park','Wonder Castle','castle',135,-20.65,'legends'),
 building('sweet-cloud','park','Sweet Cloud','bakery',115,12.25,'cafe'),
 building('souvenirs','park','Souvenirs','gear',115,22.25,'shop'),
 building('tickets','park','Ticket House','ticket',152,16.25,'rides'),
 building('west-gate','park','西ゲート・案内塔','tower',128,21.05,'guide'),
 building('east-gate','park','東ゲート・案内塔','tower',142,21.05,'guide'),
 ...Object.values(REGION_BY_ID).filter(r=>['canyon','desert','storm','ruins','sky'].includes(r.biome)).map(r=>building('shrine-'+r.id,r.id,r.name+'の神殿','shrine',r.x,r.z+(['canyon','desert'].includes(r.biome)?-1.65:-1),'story'))
];
export function nearestBuilding(region,x,z,radius=3.1){return BUILDINGS.filter(b=>b.region===region).map(b=>({...b,d:Math.hypot(x-b.x,z-b.z)})).filter(b=>b.d<radius&&(z-b.z)*b.dir>-.65).sort((a,b)=>a.d-b.d)[0]||null;}
export const SERVICE_NAMES={care:'仲間の回復',bakery:'Oliver と英会話',rest:'仲間と休む · 無料',reading:'英語の本を読む',greeting:'住人と話す',bag:'魚を売る',shop:'服・武器を買う',flight:'航空路をひらく',legends:'伝説の書',cafe:'カフェで英会話',rides:'乗り物のチケット',guide:'島の案内を聞く',story:'地域の物語'};

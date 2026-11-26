// Multiplayer client layer. Owns the Colyseus room, the 20 Hz position stream, remote
// avatars, reconnection (iPad background / lock / reload), server-authoritative wallet
// mirroring, chat and teacher commands. Offline mode = this module stays idle.
import { setClockSkew } from './shop-hours.js';
import { NET, STORAGE_KEYS, resolveServerUrl, defaultClassCode, storage } from './net-config.js';
import { createIslandPick } from './mini-pick.js';
import { hooks } from './net-hooks.js';
import { createRemotePlayers } from './remote-players.js';
import { createChat } from './chat.js';
import { createTeacherPanel } from './teacher.js';
import { createLobby } from './lobby.js';
// 画面の言語。**`t` という名前は このファイルでは使えない**（`const t = state.pendingTeleport`
// と `update(t, dt, …)` がある）ので `tr` として import する。
import { t as tr, onLangChange } from './i18n.js';
import { createMissionUI } from './mission.js';
import { createQuizUI } from './quiz.js';
import { createGymUI } from './gym.js';
import { createEikenUI } from './eiken.js';
import { createInterviewUI } from './interview.js';
import { createConvUI } from './conv.js';
import { createVoice, TALK_ISLAND } from './voice.js';
import { createBattleUI } from './battle.js';
import { createDojoUI } from './dojo.js';
import { createPetUI } from './pet.js';
import { createPetBuddy } from './pet-models.js';
import { createDailyUI } from './daily.js';
import { createRoadmapUI } from './roadmap.js';
import { createParentQrUI } from './parent-qr.js';
import { startWarp, stopWarp, setWarp } from './warp.js';
import { createNight } from './night-world.js';
import { createRideUI } from './ride.js';
import { createRaceUI } from './race.js';
import { createKartGame } from './kart-game.js';
import { createDashboard } from './dashboard.js';
import { createQuick5 } from './quick5.js';
import { createWardrobe } from './wardrobe.js';
import { createKidsUI, KIDS_ISLANDS } from './kids.js';
import { createAbcUI } from './abc.js';
import { createReadAloud } from './read-aloud.js';
import { createFarmUI, nextStep as nextFarmStep } from './farm.js';
import { createLand } from './land-world.js';
import { createLandUI } from './land.js';
import { createFishworldUI } from './fishworld.js';
import { createWeaponShop } from './weapon-shop.js';
import { createBikeShop } from './bike-shop.js';
import { createBikeRide } from './bike-ride.js';
import { createWordHouseUI } from './wordhouse.js';
import { createFoodUI } from './food.js';
import { createBagUI } from './bag.js';
import { createFoodGive } from './food-give.js';
import { createNpcSocial } from './npc-social.js';
import { createMainIsland } from './main-island.js';
import { createRacers } from './racers.js';
import { createGuestDock } from './guest-dock.js';
import { createBlockwild, cacheBlocks } from './blockwild.js';
import { createPuyo } from './puyo.js';
import { createSuika } from './suika.js';
import { dressAvatar } from './avatars.js';
import { itemModel } from './wardrobe-models.js';
import { createRoom } from './room-world.js';
import { createPlaza } from './plaza-world.js';
import { createTownUI } from './town.js';
import { createClassMode } from './class-mode.js';
import { createTaskCard } from './tasks.js';
import { createTaskGuide } from './task-guide.js';
import { createPremiumPromo } from './premium.js';
import { createHomework } from './homework.js';
import { createReadingUI } from './reading.js';
import { createLibrary } from './library.js';
import { createPlanetarium } from './planetarium.js';
import { sfx } from './sfx.js';

// いま 幼児モードの 画面か（部屋が オンに した 子＋ じぶんで 🧸 を おした 人）。
const kidsNow = () => globalThis.document?.body?.dataset.mode === 'kids';

// アバターの 3D の 形を、three.js に たよらない データに する（{ parts: [{ pos, norm, index, color, matrix }], height }）。
// 体は player の 子の うち `userData.limbs` を 持つ もの（avatars.js の buildAvatar）。かげ・名札・ペットは 入れない。
function avatarBlueprint(player) {
  const model = player.children.find((c) => c.userData?.limbs) || null;
  if (!model) return null;
  model.updateWorldMatrix(true, true);
  const inv = model.matrixWorld.clone().invert();
  const parts = []; let top = 0;
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat?.color || (mat.transparent && mat.opacity < 0.6)) return;
    for (let p = o.parent; p && p !== model; p = p.parent) if (!p.visible) return;
    const g = o.geometry; const matrix = inv.clone().multiply(o.matrixWorld);
    if (!g.boundingBox) g.computeBoundingBox();
    top = Math.max(top, g.boundingBox.clone().applyMatrix4(matrix).max.y);
    parts.push({ pos: Array.from(g.attributes.position.array), norm: g.attributes.normal ? Array.from(g.attributes.normal.array) : null, index: g.index ? Array.from(g.index.array) : null, color: mat.color.getHex(), matrix: matrix.toArray() });
  });
  return parts.length && parts.length < 400 ? { parts, height: top || 2 } : null;
}

export function setupNet({ scene, camera, view, player, rpg, fishing, avatars, park, renderer, toast, speak, learn, guide = null }) {
  let fwAutoAt = ''; // いま 自動で つりはじめた 水辺（はなれると 空に もどる）
  let main = null; // メインの島（下で作る。財布と進み具合が届くたびに数字を書き直す）
  const Colyseus = globalThis.Colyseus;
  const $ = (s) => document.querySelector(s);
  const state = {
    mode: 'offline', // offline | connecting | online | reconnecting
    role: 'student', sessionId: null, name: '', classCode: '', teacherKey: '', pin: '',
    attempts: 0, intentionalLeave: false, chatPaused: false, freeChat: true, teacherId: '',
    progress: null, wallet: null, move: null, pet: null, lastSpace: '', lastSendAt: 0, lastSent: { s: '', x: NaN, z: NaN, r: NaN, a: '' }, lastProgressJson: '', lastProgressAt: 0,
    pendingTeleport: null, hiddenAt: 0, resumedAt: 0, lastAvatarJson: '',
    // How far this device's clock is from the server's, measured once on joining. The
    // sky then runs locally: it is a function of the time, so it needs no updates.
    skew: 0,
    riding: '', speed: 1,
  };
  let client = null;
  let room = null;
  let planetarium = null;  // planetarium.js（メインの島の プラネタリウムの 中。下で 作る）
  let library = null;  // library.js（メインの島の としょかんの 中。下で 作る）
  let social = null;   // npc-social.js（下で 作る。currentSpace が 先に 呼ばれても よい ように ここで 名前だけ）
  let reconnectTimer = null;
  let probeTimer = null;
  const prefs = storage.get(localStorage, STORAGE_KEYS.prefs) || {};
  const remotes = createRemotePlayers({ worldScene: scene, getInteriorScene: () => rpg.interiorScene, getLocalPosition: () => player.position });
  const chip = createStatusChip();
  // Every island screen asks the server something it answers from where the child is
  // standing — start a set, buy a vehicle, hand in an errand. A child taps the moment they
  // arrive, and the position only goes up twenty times a second, so the room would answer
  // from where they were a frame ago and refuse them. Say where they are first: the socket
  // keeps the order, so the move lands before the question.
  const atSend = (type, payload) => { if (room && state.mode === 'online') sendMove(); room?.send(type, payload); };
  const chat = createChat({
    onSend: (id) => room?.send('chat', { id }),
    // Free text: the page sends the words and nothing else. Whether they may be sent —
    // the length, the words, the teacher's switch — is decided on the server, and this
    // never pretends to know the answer in advance.
    onSay: (text) => room?.send('chat', { text }),
    speak, toast,
    isPaused: () => state.chatPaused && state.role !== 'teacher',
    // 幼児モードの 子は 定型文だけ（文字を 打つ 場面を なくす。部屋も 通さない）。
    isFree: () => (state.freeChat !== false || state.role === 'teacher') && !kidsNow(),
  });
  const teacher = createTeacherPanel({
    send: (msg) => room?.send('teacher', msg), toast,
    getPoint: () => ({ x: round(player.position.x, 2), z: round(player.position.z, 2) }),
    getSpace: currentSpace, isInsideBuilding: () => currentSpace().startsWith('in:'),
    getMissions: () => mission.missions,
  });
  // 授業モード（先生だけの ボタン）と 苦手の 復習（class-mode.js）。
  const classMode = createClassMode({
    send: (type, msg) => room?.send(type, msg),
    toast, speak,
    // 今いる 場所（行き先の 一覧から のぞく）。メインの島の 英単語ハウスの 中なら その家。
    getHere: () => {
      const inside = rpg.insideBuilding;
      if (inside?.island === 'main' && /^hut_/.test(inside.spot || '')) return { id: inside.spot, island: 'main' };
      return { id: rpg.state.current, island: rpg.state.current };
    },
    getGatherPoint: () => (currentSpace().startsWith('in:') ? null : { space: rpg.state.current, x: round(player.position.x, 2), z: round(player.position.z, 2) }),
    goPlace,
  });
  const mission = createMissionUI({
    send: atSend,
    speak, toast, isOnline: () => state.mode === 'online',
    here: () => rpg.state.current === 'errand',
    travel: (id) => rpg.fly(id),
    setBeacon: (spotId) => rpg.errand.setTarget(spotId),
  });
  const quiz = createQuizUI({
    send: atSend,
    speak, toast, isOnline: () => state.mode === 'online',
  });
  const gym = createGymUI({
    send: atSend,
    speak, toast, isOnline: () => state.mode === 'online',
  });
  // 英検の島. Four halls on each of three islands, and the hall a child walked into is
  // the skill they are practising — the page never picks it, and never marks it either.
  const eiken = createEikenUI({
    send: atSend,
    speak, toast, learn, isOnline: () => state.mode === 'online',
  });
  // めんせつの間. The fifth building on the same islands, and the only one that talks
  // back: the 英検 interview, with ウーピー asking and the server marking.
  const interview = createInterviewUI({
    // Sitting down and every answer are both answered from where the child is standing,
    // so say where that is first — a child who has just walked through the door would
    // otherwise be told they are not in the room.
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
  });
  // おはなし. The room a child walks into is the call they are in: the voices go browser
  // to browser and this layer only carries the introductions.
  const voice = createVoice({
    send: atSend,
    toast,
    roomLabel: (space) => (space === TALK_ISLAND ? tr('みんなで はなす しまの ひろば') : rpg.insideBuilding?.spot?.name || ''),
    // Pressing the rail's call button where no call is possible takes the child to the
    // island where one always is. Flying is the game's own way of going somewhere, so it
    // is the game's own flight, not a teleport — and, like every other flight in this
    // game, it has to leave the building first. Returns whether it set off, so the button
    // does not announce a journey the game refused.
    hallLocked: () => (rpg.premiumLock || []).includes(TALK_ISLAND),
    onGoToHall: () => {
      if (rpg.state.current === TALK_ISLAND) return true;
      rpg.inside?.leave?.(true);
      return rpg.fly(TALK_ISLAND);
    },
  });
  // 英会話島: ウーピー on a screen, and a child talking back. What the page sends is what
  // the microphone heard; the aims, the coins and the XP all come back from the server.
  const conv = createConvUI({
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
  });
  // ぼくじょう島: every farm job costs an English act, judged by the room. The island's
  // own field and pen are redrawn from whatever the room says the farm looks like.
  // The beam of light over the island points at the building to visit next (nextStep),
  // so a child who has never farmed is never wondering where to go.
  const farm = createFarmUI({
    send: atSend, toast, speak, isOnline: () => state.mode === 'online',
    onFarm: (f) => { rpg.farm?.setFarm?.(f); rpg.farm?.setTarget?.(nextFarmStep(f)?.spot || ''); },
  });
  const battle = createBattleUI({
    send: atSend, renderer, getPet: () => state.pet,
    speak, toast, isOnline: () => state.mode === 'online',
  });
  const dojo = createDojoUI({
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
    getWallet: () => state.wallet, getMove: () => state.move,
  });
  const petUI = createPetUI({
    send: atSend, renderer,
    toast, isOnline: () => state.mode === 'online',
    getPet: () => state.pet, getWallet: () => state.wallet,
  });
  // 手に 入れた ペットは いつも 横を 歩く（となりの 子からも 見える：部屋が 姿の 文字に 入れて 配る）。
  const petBuddy = createPetBuddy(player);
  const daily = createDailyUI({
    send: atSend,
    isOnline: () => state.mode === 'online',
  });
  // 👪 おうちの ひとの LINE（この 子 だけの 保護者ページの QR。URL は 部屋が きめる）。
  const parentQr = createParentQrUI({ send: atSend });
  // 🗺 ロードマップ（段階・英検の 見こみ・おすすめの 場所）。「いく」は その 島へ ひこうきで。
  const roadmap = createRoadmapUI({
    send: atSend, toast, speak,
    // 「つぎは これ」を おすと その 場所（建物の 戸口の 前）へ すぐ ワープ（さがす 手間を なくす）。
    // プレミアムの 島・まだ ひらいて いない 島には とばない（いつもどおり 🔒）。
    go: (p) => {
      if (!p?.island) return false;
      if (rpg.premiumLock?.includes(p.island)) { toast(tr('🔒 プレミアムの しまです。せんせいに きいてね。')); return true; }
      if (rpg.store?.unlocked && !rpg.store.unlocked(p.island) && p.island !== 'main') { toast(tr('まだ ひらいていません')); return true; }
      try { startWarp(); setWarp(0.5); setTimeout(stopWarp, 700); } catch { /* 演出なし */ }
      if (!goPlace({ island: p.island, to: p.island })) return rpg.fly(p.island);
      const isl = rpg[p.island]?.data;
      const sp = p.spot && isl?.spots?.find((x) => x.id === p.spot);
      if (sp) {
        const at = sp.path || { x: sp.x, z: sp.z + 4 };
        player.position.set(isl.x + at.x, 0, isl.z + at.z);
        state.lastSent.s = '';
      }
      toast(`✨ ${p.ja}`);
      return true;
    },
  });
  // まちづくり島. The room a child builds in is an interior scene of its own, like the
  // park's: the island, the weather and everyone else stay outside. (`room` is already
  // the Colyseus room in this file, so the child's own room is `myRoom`.)
  const myRoom = createRoom({
    player, camera, view, toast, speak, learn,
    send: atSend,
    // 出る 先は 入った 戸口：メインの島の「じぶんの いえ」から 入ったら その いえの 前、まちづくり島からなら いままでどおり。
    // へやに いる 間も rpg.state.current は 入った 島の まま（へやは 島を きりかえない）。
    onLeave: () => {
      town.hideHud();
      const d = rpg.state.current === 'main' ? rpg.main?.data : null;
      const home = d?.spots?.find((sp) => sp.kind === 'my_home');
      if (!home) { rpg.activate('town', true); return; }
      rpg.activate('main', true);
      player.position.set(d.x + home.x, 0, d.z + home.z + 1.6);   // 戸口の すぐ 外（また 入らない ところ）
      player.rotation.y = Math.PI;   // いえを せに して 立つ
    },
  });
  // ひろば. Blocks are stacked on the child's own lot in the square, which is its own
  // scene for the same reason the room is: nothing of it exists until they walk in.
  const myPlaza = createPlaza({
    player, camera, view, toast, speak, learn,
    send: atSend,
    onLeave: () => { town.hideHud(); rpg.activate('town', true); },
  });
  rpg.attachRoom(myRoom, myPlaza);
  // 土地島. The island a child owns is a scene of its own, like the room: built from what
  // the room says they bought, walked around, left from the jetty.
  const myLand = createLand({ player, camera, view, toast, onLeave: () => rpg.activate('land', true) });
  rpg.attachLand(myLand);
  const land = createLandUI({
    send: atSend, toast, isOnline: () => state.mode === 'online', world: myLand,
    // じぶんの しまが まだ ない 子を、ふどうさんの 戸口へ（歩いて 入ったのと 同じ 場所）つれて いって ひらく。
    goOffice: () => {
      const isl = rpg.land?.data; const office = isl?.spots?.find((x) => x.id === 'office'); if (!isl || !office) return;
      // 戸口の すぐ 前（世界を えらんだ ときと 同じ 置き方）。戸口の しくみが そのまま 画面を ひらく。
      player.position.set(isl.x + office.x, 0, isl.z + office.z - 0.65); state.lastSent.s = ''; sendMove();
    },
  });
  // つり島: Roblox の釣りワールド。池・川・海の水辺に立って さおを なげる。くじは部屋。
  const fishworld = createFishworldUI({ send: atSend, toast, speak, isOnline: () => state.mode === 'online', island: rpg.fishworld });
  // Walking into the doorway is what opens both of them. There is no counter inside and
  // nothing to press: the island reports the doorway, and this asks the server for what
  // is behind it.
  rpg.setDoorHandler((islandId, spot) => {
    // 戸口に 入ったら じてんしゃから おりる（どの 島の どの 戸口でも）。
    bikeRide?.dismount('door');
    // ミニゲーム島 is nothing but doors to other games: the house a child walks into is
    // the game, and none of it needs the server, so it opens offline too.
    // メインの島：英単語ハウス・看板・つり場・かいとりや・ゲート。何をするかは main-island.js の walkIn。
    // 幼児モード：メインの島の ゲートと BLOCKWILD は、行ける 島（kids.js の KIDS_ISLANDS）だけ 通す。
    if (islandId === 'main' && kidsNow() && (spot?.kind === 'blockwild' || (spot?.kind === 'gate' && !KIDS_ISLANDS.includes(spot.to)))) { toast(tr('ここは せんせいに きいてね')); return true; }
    if (islandId === 'main') { sendMove(); return main.walkIn(spot); }
    // しゅくだい島：いえに 入ると 宿題の 一覧（オンラインの とき だけ。問題は 部屋に ある）。
    if (islandId === 'homework') return homework.open();
    if (islandId === 'reading') return reading.open();
    // ABC の 島：つみきの いえに 入ると「ABC と おと」（幼児モードで なくても あそべる）。
    if (islandId === 'abc') return abc.open();
    if (islandId === 'mini') {
      const game = arcades[spot.game || spot.kind];
      if (game) { game.open(); return true; }
      return false;
    }
    // 土地島: the office, the ferry and the board are all walked into; the room answers.
    if (islandId === 'land') {
      if (state.mode !== 'online') { toast(tr('土地島は オンラインで あそべます。')); return false; }
      sendMove();
      return land.enter(spot);
    }
    if (islandId !== 'town') return false;
    // ブロックの とびら is not a room to go into, it is a game to leave for — and unlike
    // everything else on this island it needs nothing from the server, so it opens
    // whether or not the class is connected.
    if (spot.kind === 'blockwild') { blockwild.open(); return true; }
    if (spot.kind !== 'door' && spot.kind !== 'plaza') return false;
    if (state.mode !== 'online') { toast(tr('まちづくり島は オンラインで あそべます。')); return false; }
    // Say where we are before asking to come in: the doorway was reached this frame, and
    // the server would otherwise answer from the position it was last told about.
    sendMove();
    room?.send(spot.kind === 'door' ? 'room:enter' : 'plaza:enter', {});
    return true;
  });
  const town = createTownUI({
    send: atSend,
    toast, speak, learn, isOnline: () => state.mode === 'online', room: myRoom, plaza: myPlaza,
  });
  // のりもの島. The speed a vehicle gives is applied by the world; what it is worth and
  // whether it is yours are the server's to say.
  // のりもの島のレース. The kart, the HUD and the rivals live here; the order and the
  // prizes come back from the room.
  const race = createRaceUI({
    // Everything a race asks is answered from where the kart is: the checkpoint claimed
    // this frame, the box driven over this frame, the place on the grid. Say where that
    // is before asking, or the server answers from the position it was last told about —
    // at boost speed on a slow tablet that is several kart lengths back, and the child
    // loses the lap without ever being told why.
    send: atSend,
    toast, isOnline: () => state.mode === 'online',
    scene, player, rpg,
    // While the race owns the screen the island stops talking: its own signs and the names
    // over the other children's heads come down, because at eight metres they are a wall
    // of text across the road. Who is where is in the corner of the race screen instead.
    onScreen: (on) => { rpg.ride?.setLabels?.(!on); remotes.setTags(!on); },
  });
  // U-SPEAK GRAND PRIX. Its own game: pressing start hands the renderer over and the island
  // stops until the flag. The room still decides what a race was worth.
  const gp = createKartGame({
    renderer,
    send: (type, payload) => { if (room && state.mode === 'online') room.send(type, payload); },
    toast,
    isOnline: () => state.mode === 'online',
    onExit: () => { rpg.holdDoors?.(false); },
  });

  // きょうの 5ふん. Five questions from anywhere, marked by the room like the 英検 halls.
  const quick = createQuick5({
    send: (type, payload) => { if (room && state.mode === 'online') room.send(type, payload); },
    speak, toast, isOnline: () => state.mode === 'online',
  });
  // マイページ. The room works out the shape; this only draws it.
  const dash = createDashboard({
    send: (type, payload) => { if (room && state.mode === 'online') room.send(type, payload); },
    isOnline: () => state.mode === 'online',
    toast,
    onQuick: () => quick.open(),
  });

  // きせかえ. The room owns what is owned and worn; this draws it and asks.
  const wardrobe = createWardrobe({
    send: (type, payload) => { if (room && state.mode === 'online') room.send(type, payload); },
    isOnline: () => state.mode === 'online',
    toast,
    avatars,
  });
  // メインの島（2D の地図のホーム）と 英単語ハウス。正解もコインも部屋が決める（wh:* / main:*）。
  const plainSend = (type, payload) => { if (room && state.mode === 'online') room.send(type, payload); };
  // 左の「つぎに やること」。中身も すんだかも 部屋が 決める。
  const taskGuide = createTaskGuide({ scene, player, rpg });
  // ついた：画面が ひらいて いなければ、出て いる「○○を 見る」を かわりに おす（歩けない 子の ための ボタンなので、さいごの 1 おしも いらなく する）。
  taskGuide.onArrive = () => {
    toast('ついたよ！');
    setTimeout(() => {
      if (document.querySelector('dialog[open]') || rpg.insideBuilding || rpg.interiorScene || document.body.dataset.arcade) return;
      const near = document.querySelector('#near'); const btn = document.querySelector('#interact');
      if (near && btn && near.style.display !== 'none' && btn.getClientRects().length) btn.click();
    }, 900);
  };
  // ⭐ プレミアムの おしらせ（🔒 の 島や お店を おした とき）。
  createPremiumPromo({ offline: () => state.mode !== 'online' && state.mode !== 'reconnecting' });
  // 宿題（しゅくだい島の いえ）。問題・判定・ごほうびは 部屋（hw:*）。
  const homework = createHomework({ send: (type, msg) => room?.send(type, msg), speak, toast, isOnline: () => state.mode === 'online', openBook: (id) => reading.openBook(id) });
  // よみもの島：本だなと 1 冊（きく・よむ・おんどく・クイズ）。クイズの 正解・✓・コインは 部屋（read:*）。
  const reading = createReadingUI({ send: (type, msg) => room?.send(type, msg), speak, toast, isOnline: () => state.mode === 'online' });
  // 幼児モード（先生が /teacher/kids で オンに した 子の かんたんな 画面）。きめるのは 部屋（welcome・'kids'）。
  // ---- しまの ちずで えらんだら、その 島の「だいひょうの 問題」が すぐ はじまる ----
  // カードを おす → 島に つく → その 島の 入口（下の 表の 場所）に 立たせる＝いつもの 戸口の しくみで 問題が ひらく。
  // すぐ 英語に ふれられる ように（島を 歩いて さがさなくて いい）。とじた あとは 島を 歩いて ほかの 問題へ。
  // 本だな・宿題は えらぶ 画面が ひらく（1 問を かってに 始めない）。のりもの島は レース、まちづくり島は ブロックの ひろば、つり島は つりが すぐ はじまる。
  const QUICK_SPOT = {
    // メインの島は どこにも 入れない：えらんだら 島に 出るだけ（リスポーン）。
    abc: 'abchouse', reading: 'library', homework: 'desk', fishworld: 'pond', school: 'easy', arena: 'easy',
    ride: 'start',   // のりもの島：スタートの そばに 立たせて、すぐ AURORA KART を ひらく
    mini: '*', conv: '*', land: '*', farm: '*', // ミニゲーム島・英会話島：ついたら すぐ「どれに する？」（mini-pick.js の PICKS）。とじれば 島を 歩ける
    town: 'plaza',   // まちづくり島：すぐ ブロックの 世界（BLOCKWILD）
    wear: 'avatar-shop', // きせかえ島：すぐ すがたや（アバターを 買う・きがえる）
    eiken5: '*', eiken4: '*', eiken3: '*', eikenp2: '*', eiken2: '*', eikenp1: '*', eiken1: '*', // 英検の 島：パネルで 館を えらぶ（PICKS）
  };
  let quickPick = null; // { id, until }
  addEventListener('uspeak:mappick', (e) => { const id = String(e.detail || ''); quickPick = QUICK_SPOT[id] ? { id, until: Date.now() + 30000 } : null; });
  setInterval(() => {
    if (!quickPick) return;
    if (Date.now() > quickPick.until) { quickPick = null; return; }
    if (rpg.state.current !== quickPick.id || rpg.state.mode === 'flight' || rpg.isOpen || state.mode !== 'online') return;
    if (document.querySelector('dialog[open]') || document.body.dataset.warp || document.body.dataset.classPause) return;
    const id = quickPick.id; quickPick = null;
    try {
      if (PICKS[id]) { const cfg = PICKS[id](); if (cfg) islandPick.show(cfg); return; }
      const isl = rpg[id]?.data; const spot = isl?.spots?.find((x) => x.id === QUICK_SPOT[id]);
      if (!isl || !spot) return;
      // のりもの島の スタートは「はなす」で ひらく 場所（戸口では ない）ので、そばに 立たせて そのまま ひらく。
      if (id === 'ride') { player.position.set(isl.x + spot.x, 0, isl.z + spot.z + 2); state.lastSent.s = ''; sendMove(); racers.open(); return; } // すぐ AURORA KART（レースの ゲーム）
      // きせかえ島の 店も「はなす」で ひらく：その 店の たなを そのまま ひらく。
      if (id === 'wear') { player.position.set(isl.x + spot.x, 0, isl.z + spot.z + 4); state.lastSent.s = ''; sendMove(); wardrobe.open({ slot: spot.slot || spot.kind }); return; }
      // まちづくり島：ひろばに 立たせて、すぐ ブロックの 世界（BLOCKWILD）を ひらく。
      if (id === 'town') { player.position.set(isl.x + spot.x, 0, isl.z + spot.z - 0.65); state.lastSent.s = ''; sendMove(); blockwild.open(); return; }
      // えいごアリーナの 台も「はなす」で はじまる（やさしい 台の バトル）。
      if (id === 'arena') { player.position.set(isl.x + spot.x, 0, isl.z + spot.z + 2); state.lastSent.s = ''; sendMove(); battle.enter(spot); return; }
      // つり島は 水辺の 立つ 場所（うきの 落ちる cast では ない：そこは 水の 中で 出られなく なる）。ほかは 戸口の すぐ 前。
      if (spot.cast) player.position.set(isl.x + spot.x, 0, isl.z + spot.z);
      else player.position.set(isl.x + spot.x, 0, isl.z + spot.z - 0.65);
      state.lastSent.s = '';
    } catch (err) { console.warn('[net] quick start failed', err); }
  }, 300);

  // よみあげ（🔊）：幼児モードの どの 画面でも、おしてから さわった 文を 読む。
  createReadAloud({ speak, isOn: kidsNow });
  // 🧸 で じぶんの 画面を きりかえた ときも、チャットの 入力らんを あわせる。
  addEventListener('uspeak:kids', () => { try { chat.setFree(); } catch { /* まだ できて いない */ } });
  // 「ABC と おと」（幼児モードの ホームの カード）。正解・すすみ・記録は 部屋（abc:*）。
  const abc = createAbcUI({ send: (type, msg) => room?.send(type, msg), speak, toast, isOnline: () => state.mode === 'online', openShelf: () => reading.open() });
  const kids = createKidsUI({
    speak, toast, rpg, player, goPlace, isOnline: () => state.mode === 'online',
    pendingHomework: () => state.homeworkCount || 0,
    askHomework: () => { if (room && state.mode === 'online') room.send('hw:list'); },
    openHomework: () => homework.open(), openReading: () => reading.open(), openAbc: () => abc.open(), openWardrobe: (o = {}) => wardrobe.open(o), openMap: () => rpg.openMap(),
    enterMain: (spot) => { sendMove(); main.walkIn(spot); },
    logout: () => document.getElementById('logout-button')?.click(),
  });
  const taskCard = createTaskCard({ send: plainSend, isOnline: () => state.mode === 'online', guide: taskGuide, openHomework: () => homework.open() });
  // おなか（どの島でも）と メインの島の 屋台。数・値段・かばんは 部屋が決める（food:*）。
  let bag = null;
  let bikeRide = null;   // じてんしゃに のる（bike-ride.js。下で 作る）
  const food = createFoodUI({ send: (type, payload) => { if (type === 'food:open' || type === 'food:buy') sendMove(); plainSend(type, payload); }, toast, speak, isOnline: () => state.mode === 'online', onCoins: (w) => applyWallet(w), onBagOpen: () => bag.open('food'), onChange: () => bag?.refresh(), onGoFood: () => main?.goHome() });
  // 持ち物（🎒）：たべもの・ふく・いえ・ブロック。中身は 部屋（bag:get）。
  // たべものを 頭の 上に もつ・住民に あげる（food-give.js）。そばの 住民は いまの 島の island-kit の nearest。
  // 住民と はなす・なかよしの 住民の いえ（npc-social.js）。いえは マイルームと 同じ しくみ（rpg.attachHome）。
  social = createNpcSocial({ player, camera, rpg, food, send: plainSend, toast, speak, isOnline: () => state.mode === 'online', give: (info, id) => foodGive.giveTo(info, id) });
  // としょかんの 中（library.js）：ほんだな＝よみもの島の 本だな、つくえ＝しゅくだい・ふくしゅう・たんごちょう（どれも 前から ある 画面）。
  library = createLibrary({
    player, camera, toast, rpg, isOnline: () => state.mode === 'online',
    openReading: () => reading.open(), openHomework: () => homework.open(),
    openReview: () => plainSend('review:start', { all: true }), openWordbook: () => $('#journal')?.click(),
    look: (y, p) => globalThis.uspeak?.view?.look(y, p),
  });
  try { rpg.attachLibrary?.(library); } catch { /* 古い rpg.js */ }
  // プラネタリウムの 中（planetarium.js）：ドームの 星空と 星座。英語の 名前を 読みあげる。
  planetarium = createPlanetarium({ player, camera, toast, rpg, speak: (t) => speak?.(t, { japanese: false }) });
  try { rpg.attachPlanetarium?.(planetarium); } catch { /* 古い rpg.js */ }
  const foodGive = createFoodGive({
    player, food, send: plainSend, toast, speak, isOnline: () => state.mode === 'online', onChange: () => bag?.refresh(),
    onTalk: (at) => social.talkTo(at), onGaveTalk: (m, target) => social.onGave(m, target),
    near: () => {
      if (social.home.active) return social.nearInHome();
      const id = rpg.state.current; const isl = rpg[id];
      if (rpg.state.busy || rpg.state.mode === 'flight' || rpg.insideBuilding || rpg.inRoom || rpg.inPlaza || typeof isl?.nearest !== 'function' || typeof isl.origin !== 'function') return null;
      const at = isl.nearest(player);
      if (!at?.spot?.id) return social.nearWalker();
      const o = isl.origin();
      return { island: id, spot: at.spot, x: o.x + at.spot.x, z: o.z + at.spot.z };
    },
  });
  // じてんしゃ（じてんしゃや で 買う・bike-ride.js）。のれるのは 外に いて、島が 見えて いて、体を ほかの ことに 使って いない ときだけ。
  // ここが false に なると のって いても じぶんで おりる（家・部屋の 中・ひこうき・つり・レース・全画面の ゲーム・授業の ストップ・会話・ねて いる）。
  const canRideBike = () => state.mode === 'online' && rpg.state.mode !== 'flight' && !currentSpace().startsWith('in:')
    && !rpg.inRoom && !rpg.insideBuilding && !rpg.inside?.active && !rpg.insidePark && !park?.state.inPark && !park?.state.busy
    && !race.driving && !gp.running && !racers.isOpen && !blockwild.isOpen && !Object.values(arcades).some((g) => g.isOpen) && !battle.staged && !main?.isOpen
    && !fishing.isOpen && !fishing.state.busy && !fishworld.isOpen && !fishworld.busy && !rpg.fishworld?.casting && !rpg.main?.casting
    && document.body.dataset.classPause !== '1' && !document.body.dataset.npcTalk && !document.body.dataset.sleeping && !document.body.dataset.warp;
  bikeRide = createBikeRide({ player, store: fishing.store, send: plainSend, isOnline: () => state.mode === 'online', toast, canRide: canRideBike });
  const bikeShop = createBikeShop({ store: fishing.store, toast, renderer, speak: (t) => speak?.(t, { japanese: false }), ride: bikeRide });
  bag = createBagUI({ send: plainSend, toast, isOnline: () => state.mode === 'online', food, renderer, hold: foodGive, bike: bikeRide });
  const wordhouse = createWordHouseUI({ send: plainSend, toast, speak, isOnline: () => state.mode === 'online', onCoins: (w) => applyWallet(w) });
  main = createMainIsland({
    send: plainSend, toast, isOnline: () => state.mode === 'online', rpg, fishworld, wordhouse, daily, dash, food,
    shops: { library, planetarium, wardrobe, town, land, conv, homework, weapons: createWeaponShop({ store: fishing.store, toast, renderer, speak: (t) => speak?.(t, { japanese: false }) }), bikes: bikeShop, get blockwild() { return blockwild; } },
    guide: guide || { open() {} },
    getCoins: () => state.wallet?.coins ?? fishing.store.state.coins,
    getLevel: () => state.progress?.level ?? Number(document.querySelector('#level')?.textContent || 1),
    getStreak: () => state.streak || 0,
    player,
  });
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'main-island-button';
    b.className = 'rank-button main-island-button';
    b.innerHTML = '<b class="en">🏠 Main Island</b><i class="ja">メインの しま</i>';
    // 島の外では ホームへ ひこうきで、島の上では 2D の地図（リストでも見られる）。
    b.onclick = () => main.goHome();
    document.querySelector('.right-rail')?.prepend(b);
    // おなかの ゲージは 右のバーの いちばん上（どの島でも 見える）。
    document.querySelector('.right-rail')?.prepend(food.gauge);
    // パソコン（マウス）では 右のバーは 並びではなく、ボタンが 1 つずつ 場所を 持つ（style.css）。場所の ない
    // ゲージ・🏠・ランキングが 左上に 落ちて ロゴに かさなっていたので、地図の すぐ左に 1 つの 列で 置く。
    if (document.documentElement.classList.contains('pc-ui')) {
      const dock = document.createElement('div');
      dock.className = 'top-dock';
      dock.append(food.gauge, b);
      const rank = document.querySelector('#rank-button');
      if (rank) dock.append(rank);
      const road = document.querySelector('#roadmap-button');
      if (road) dock.append(road);
      document.querySelector('main')?.append(dock);
    }
  }
  // Put the child's own clothes on their own body, and keep them on when they change face.
  const dressMe = (worn, table) => {
    avatars.setOutfit((worn || []).map((id) => table?.byId.get(id)).filter(Boolean),
      (model, items) => dressAvatar(model, items, itemModel));
  };

  // The guest games: whole other games in frames of their own — see arcade.js. Each takes
  // the whole window, so the island's name tags and the classmates' labels go with the
  // rest of the furniture, the same way they do for a race.
  const guest = {
    onOpen: () => { remotes.setTags(false); rpg.holdDoors(true); },
    onClose: () => { remotes.setTags(true); rpg.holdDoors(false); },
    toast,
  };
  // レースの ことばの ゲート：問題を もらい（kart:start）、くぐった レーンを 送る（kart:answer）。正解と コインは 部屋が 決める。
  const kartWait = { start: new Map(), answer: new Map(), n: 0 };
  const kartAsk = (map, key, type, msg) => new Promise((resolve, reject) => {
    if (state.mode !== 'online' || !room) { reject(new Error('offline')); return; }
    const t = setTimeout(() => { map.delete(key); reject(new Error('timeout')); }, 6000);
    map.set(key, { resolve: (v) => { clearTimeout(t); map.delete(key); resolve(v); }, reject: (e) => { clearTimeout(t); map.delete(key); reject(e); } });
    room.send(type, msg);
  });
  const kart = {
    start: (grade, count) => { const ref = `r${kartWait.n += 1}`; return kartAsk(kartWait.start, ref, 'kart:start', { grade, count, ref }); },
    answer: (id, i, choice) => kartAsk(kartWait.answer, `${id}:${i}`, 'kart:answer', { id, i, choice }),
    // じぶんの アバター（きせかえ島で 買った すがた・ぼうし なども）の 形。AURORA KART は three.js の 版が ちがうので、
    // 頂点・色・位置だけを わたして あちらで 組み立てる（racers/game.js の uspeakDriver）。
    get avatar() { try { return avatarBlueprint(player); } catch { return null; } },
  };
  const racers = createRacers({ ...guest, kart });          // AURORA KART, from のりもの島
  // ブロック屋で買った物は BLOCKWILD の持ち物でもある。持ち主はサーバー（`block:shop`）で、
  // ここにあるのはその写し — 部屋が言ってきたら更新し、オフラインのために書き留めておく。
  let ownedBlocks = [];
  // `block:shop` と `block:bought` は同じ棚の中身を運んでくる。買った直後に更新しないと、
  // 買ってすぐ BLOCKWILD を開いた子には まだ そのブロックが無い。
  // The shelf the in-game shop draws from: the block shop's blocks (price, colour, owned)
  // and the gear (blockwild-gear.json, priced by the room). `bw:shop` brings both.
  const shelf = { blocks: [], gear: [] };
  const rememberBlocks = (m) => {
    if (!Array.isArray(m?.blocks)) return;
    shelf.blocks = m.blocks;
    ownedBlocks = m.blocks.filter((b) => b.owned).map((b) => b.id);
    cacheBlocks(ownedBlocks);
  };
  const blockwild = createBlockwild({
    ...guest, ownedBlocks: () => ownedBlocks, shelf: () => shelf,
    send: (type, msg) => { try { room?.send(type, msg); } catch (err) { console.warn('[net] bw send failed', err); } },
    session: () => ({ online: state.mode === 'online', classCode: state.classCode, name: state.name, coins: state.wallet?.coins ?? 0 }),
  });
  // ミニゲーム島: one house each, and the house is the menu.
  const arcades = { puyo: createPuyo(guest), suika: createSuika(guest) };
  const islandPick = createIslandPick();
  const hex = (n) => '#' + Number(n).toString(16).padStart(6, '0');
  // 家を えらぶ パネル：島の データの spots を そのまま カードに する。えらぶと 戸口の すぐ 前に 立つ。
  const housePick = (id, title, extra) => { const isl = rpg[id]?.data; if (!isl?.spots?.length) return null; return { title,
    cards: isl.spots.map((sp) => ({ value: sp, icon: sp.tone || sp.icon || '🏠', en: sp.en, ja: sp.name, color: hex(sp.color), ...extra(sp) })),
    onPick: (c) => { player.position.set(isl.x + c.value.x, 0, isl.z + c.value.z - 0.65); state.lastSent.s = ''; sendMove(); } }; };
  const EIKEN_SUB = { reading: ['Read and choose', 'よんで えらぶ'], listening: ['Listen and choose', 'きいて えらぶ'], writing: ['Put words in order', 'ことばを ならべる'], speaking: ['Say it aloud', 'こえに だす'], interview: ['Interview practice', 'めんせつの れんしゅう'] };
  const PICKS = {
    mini: () => ({ title: { en: 'Which game?', ja: 'どっちで あそぶ？' }, onPick: (c) => arcades[c.value]?.open(), cards: [
      { value: 'suika', cls: 'suika', icon: '🍉', en: 'Fruit Merge', ja: 'えいご スイカゲーム', subEn: 'Drop fruit and make words', subJa: 'くだものを おとして くっつけよう' },
      { value: 'puyo', cls: 'puyo', icon: '🟢', en: 'PUYO U-SPEAK', ja: 'ぷよぷよ えいご', subEn: 'Line up letters to pop', subJa: 'もじを ならべて けそう' }] }),
    // 英会話島：どの 家で 話すか。えらぶと その 家の 戸口へ（戸口の しくみで いつもどおり ひらく）。
    conv: () => housePick('conv', { en: 'Where shall we talk?', ja: 'どこで はなす？' }, (sp) => ({ subEn: sp.enSub, subJa: sp.ja, tag: sp.grade ? `英検${sp.grade}級` : '' })),
  };
  // 土地島・ぼくじょう島：どの 建物に 行くか。
  PICKS.land = () => housePick('land', { en: 'Where to?', ja: 'どこに いく？' }, (sp) => ({ subJa: sp.ja, subEn: { office: 'Buy or change your island', ferry: 'Sail to your island', board: "See the class's islands" }[sp.kind] }));
  PICKS.farm = () => housePick('farm', { en: 'What shall we do?', ja: 'なにを する？' }, (sp) => ({ subJa: sp.ja, subEn: { shop: 'Buy seeds and animals', field: 'Look after the field', barn: 'Look after the animals', ship: 'Ship for coins', kitchen: 'Cook a dish' }[sp.kind] }));
  // 英検の 島（7 つ）：すぐ 部屋に 入らず、どの 館に するかを えらぶ（2026-11）。
  for (const g of ['eiken5', 'eiken4', 'eiken3', 'eikenp2', 'eiken2', 'eikenp1', 'eiken1']) PICKS[g] = () => housePick(g, { en: 'Which skill?', ja: 'どれを れんしゅう する？' }, (sp) => ({ subEn: EIKEN_SUB[sp.kind]?.[0], subJa: EIKEN_SUB[sp.kind]?.[1] }));
  // のりもの島とまちづくり島では、島の中の扉に加えて左下にも入口を出す。理由は
  // guest-dock.js に書いてある（扉が「そこまで歩かないと見えない」ため）。
  const guestDock = createGuestDock({
    open: (id) => (id === 'racers' ? racers.open() : blockwild.open()),
  });

  const ride = createRideUI({
    send: atSend,
    onArcade: () => racers.open(),
    toast, speak, learn, isOnline: () => state.mode === 'online',
    onRiding: (id, speed) => { state.riding = id; state.speed = id ? speed : 1; },
    // The start line hands over to the U-SPEAK GRAND PRIX — its own circuit, its own
    // scene, its own five rivals — and the flag hands the best lap back. The island's own
    // lap (race.js / server game/race.js) is still there and still tested, but nothing
    // opens it any more: a child on のりもの島 rides the island, and races the grand prix.
    onRace: (what) => (what === 'quit' ? gp.quit() : gp.start({ name: state.name || tr('あなた') })),
    racing: () => gp.running || race.state.phase !== 'off',
  });
  // The night belongs to the world, not to the network, but its ghosts pay coins — so
  // it is created here, where the room is, and asks the server for every one of them.
  const night = createNight({
    scene, player, toast, speak, learn,
    send: atSend,
    isOnline: () => state.mode === 'online',
    serverNow: () => Date.now() + state.skew,
  });
  const lobby = createLobby({ onJoin: (opts) => connect(opts), defaultClass: defaultClassCode(), prefs });
  // Collect the controls into one dock so the layout is decided by flexbox, not by
  // four separately maintained offsets.
  const dock = document.createElement('div');
  dock.className = 'net-dock';
  document.body.append(dock);
  for (const sel of ['#net-status', '#net-teacher-button', '#mission-button', '#net-chat-button']) {
    const el = document.querySelector(sel);
    if (el) dock.append(el);
  }

  let ownBubble = null;
  let ownBubbleUntil = 0;

  if (!Colyseus) {
    console.warn('[net] vendor/colyseus.js is missing; multiplayer disabled');
    chip.set('offline', tr('オフライン'));
  }

  // ---- helpers -----------------------------------------------------------------

  function round(v, d) { const p = 10 ** d; return Math.round(v * p) / p; }
  function currentSpace() {
    if (myRoom.active) return 'in:room';
    if (myPlaza.active) return 'in:plaza';
    // なかよしの 住民の いえ：ひとりだけの 場所（ほかの 子は 見えない・通話に ならない＝部屋の voiceRoomOf は `in:島:建物` だけ）。
    if (social?.home.active) return `in:home.${room?.sessionId || 'me'}`;
    // としょかんの 中：みんな 同じ 場所（中に いる ともだちが 見える。通話には ならない）。
    if (library?.active) return 'in:library';
    if (planetarium?.active) return 'in:planetarium';   // プラネタリウムの 中も 同じ（みんな 同じ 部屋・通話なし）
    if (myLand.active) return 'in:land';
    // Inside an island building. The name says which building on which island, and the
    // server checks it against the very place it is being asked about.
    const building = rpg.insideBuilding;
    if (building) return `in:${building.island}:${building.spot.id}`;
    const interior = rpg.adventure?.magic?.interior;
    if (interior?.active) return `in:${interior.building?.id || 'room'}`;
    return rpg.state.current || 'willow';
  }
  function joinOptions() {
    return { classCode: state.classCode, name: state.name, teacherKey: state.teacherKey || undefined, pin: state.pin || undefined, avatar: avatars.config };
  }
  // プレミアムの 島（英会話島・みんなで はなす しま・英検の 3 島・英会話の お店）。名簿の「プレミアム」を 知って いるのは
  // サーバーだけ なので、**オフラインでは いつも しめる**（前は オフラインだと 錠が からっぽで、英検の 島に 飛べた）。
  // 中身（採点・AI・通話）も サーバーが いないと うごかない。一覧は 部屋が おしえた ものを 使い、来る 前は サーバーの 既定と 同じ。
  const PREMIUM_DEFAULT = ['conv', 'talk', 'eiken5', 'eiken4', 'eiken3', 'eikenp2', 'eiken2', 'eikenp1', 'eiken1', 'talkshops'];
  function lockPremiumOffline() {
    const all = state.premiumIslands?.length ? state.premiumIslands : PREMIUM_DEFAULT;
    rpg.setPremiumLock?.(all, all);
    // いま プレミアムの 島に 立っていたら（つながりが 切れた・保存から 戻った）、メインの島へ。
    if (all.includes(rpg.state.current)) { if (rpg.fly('main') === false) rpg.activate('main', true, true); }
  }
  function setMode(mode) {
    if (mode !== 'online') { const rb = document.getElementById('roblox-button'); if (rb) rb.hidden = true; }
    state.mode = mode;
    try { taskCard.refresh(); } catch { /* before the card exists */ }
    const count = room?.state?.players?.size || 0;
    if (mode === 'online') chip.set('online', tr('オンライン'));
    else if (mode === 'reconnecting') chip.set('reconnecting', tr('つなぎ なおしています…'));
    else if (mode === 'connecting') chip.set('reconnecting', tr('つないでいます…'));
    else chip.set('offline', tr('オフライン'));
    chat.setAvailable(mode === 'online' || mode === 'reconnecting');
    voice.setAvailable(mode === 'online' || mode === 'reconnecting');
    daily.setOnline(mode === 'online' || mode === 'reconnecting');
    roadmap.setOnline(mode === 'online' || mode === 'reconnecting');
    parentQr.setOnline(mode === 'online' || mode === 'reconnecting');
    mission.setAvailable(mode === 'online' || mode === 'reconnecting');
    if (mode === 'offline' || mode === 'connecting') lockPremiumOffline();
    if (mode === 'offline') { state.progress = null; state.skew = 0; night.setGhosts([]); state.riding = ''; state.speed = 1; race.quit(); if (myRoom.active) myRoom.leave(true); if (myPlaza.active) myPlaza.leave(true); if (myLand.active) myLand.leave(true); social?.leaveHome(true); town.hideHud(); voice.setMode('off'); }
    teacher.setAvailable((mode === 'online' || mode === 'reconnecting') && state.role === 'teacher');
    const out = document.getElementById('logout-button'); if (out) out.hidden = !(mode === 'online' || mode === 'reconnecting');
    classMode.setOnline(mode === 'online' || mode === 'reconnecting');
  }
  function saveSession() {
    storage.set(sessionStorage, STORAGE_KEYS.session, { name: state.name, classCode: state.classCode, teacherKey: state.teacherKey, pin: state.pin, token: room?.reconnectionToken || '', sessionId: state.sessionId });
    storage.set(localStorage, STORAGE_KEYS.prefs, { name: state.name, classCode: state.classCode });
  }
  function clearSession() { storage.remove(sessionStorage, STORAGE_KEYS.session); }

  // ---- connection lifecycle ---------------------------------------------------------

  // ホーム（メインの島）へは つなぎはじめた しゅんかんに 立たせる。welcome を 待つと、そのあいだ U-Speak島が
  // 一瞬 見えてから とぶ（「つなぎ なおしています…」の あいだも）。つながらなくても メインの島は 歩ける。
  function homeNow() { if (!state.mainShown) { state.mainShown = true; main.goHome({ first: true }); } }

  async function connect({ name, classCode, teacherKey, pin }, { silent = false } = {}) {
    homeNow();
    if (!Colyseus) { lobby.error(tr('つうしんの ぶひんが よみこめませんでした。')); return; }
    state.name = name; state.classCode = classCode || ''; state.teacherKey = teacherKey || ''; state.pin = pin || '';
    state.intentionalLeave = false;
    state.attempts = 0;
    lobby.busy(true);
    setMode('connecting');
    try {
      client = client || new Colyseus.Client(resolveServerUrl());
      const r = await client.joinOrCreate('class', joinOptions());
      bind(r, false);
      lobby.close();
    } catch (err) {
      setMode('offline');
      const msg = friendlyError(err);
      // 先生パスワードが ちがう（または 入って いない）ときは「先生用」を ひらいて その 欄へ。
      if (silent) toast(msg); else lobby.open({ error: msg, teacher: err?.code === 4005 });
    }
  }

  function friendlyError(err) {
    const code = err?.code;
    const text = String(err?.message || err || '');
    if (code === 4001 || /name in use/.test(text)) return tr('その ユーザーネームは いま つかわれています。先生に きいてね。');
    if (code === 4000 || /name required/.test(text)) return tr('ユーザーネームを いれてね。');
    if (code === 4007 || /class required/.test(text)) return tr('パスワードを いれてね。先生に きいてね。');
    if (code === 4002 || /class is full/.test(text)) return tr('この クラスは いっぱいです。先生に つたえてね。');
    // 入場ゲート: the class register did not have this name. Say what to check, not what
    // went wrong - a child cannot fix a register.
    if (code === 4008 || /stopped/.test(text)) return tr('この アカウントは いま つかえません。先生に きいてね。');
    if (code === 4005 || /password/.test(text)) return tr('先生パスワードが ちがいます。「先生用」を ひらいて いれてね。');
    if (code === 4004 || /register/.test(text)) return tr('ユーザーネームか パスワードが ちがいます。たしかめて、先生に 聞いて ください。');
    if (/Failed to fetch|NetworkError|Load failed|ECONN|timeout/i.test(text)) return tr('サーバーに つながりません。Wi-Fi を たしかめて ください。');
    return tr('つなげませんでした（{why}）', { why: text.slice(0, 80) });
  }

  function bind(r, viaToken) {
    room = r;
    state.sessionId = r.sessionId;
    state.attempts = 0;
    let welcomed = false;

    r.onMessage('tasks:state', (m) => taskCard.set(m));
    r.onMessage('premium', (m) => { if (m.islands) state.premiumIslands = m.islands; rpg.setPremiumLock?.(m.locked || [], m.islands || []); if (m.premium) toast(tr('⭐ プレミアムの しまに 行けるように なったよ！')); });
    r.onMessage('tasks:done', (m) => { if (m.wallet) applyWallet(m.wallet); if (m.progress) applyProgress(m.progress); taskCard.done(m); });
    r.onMessage('welcome', (m) => {
      if (m.world) { state.skew = m.world.now - Date.now(); setClockSkew(state.skew); night.setPhase(m.world); }
      // The block list is also the palette's colours, so it is worth the one message.
      town.prime();
      r.send('farm:peek', {});
      welcomed = true;
      bikeRide?.resync();   // つなぎなおし：部屋は のって いた ことを わすれて いる
      state.streak = m.streak || 0;
      food.apply(m.food);
      // ホームはメインの島。はじめて入ったときだけ開く（つなぎなおしでは開かない）。
      homeNow();
      state.role = m.role;
      classMode.setRole(m.role);
      if (m.classPaused && m.role !== 'teacher') classMode.setPaused(true);
      state.chatPaused = !!m.chatPaused;
      state.teacherId = m.teacherId || '';
      setMode('online');
      saveSession();
      chat.setPaused();
      teacher.setChatPaused(state.chatPaused);
      teacher.setVoice(r.state?.voice);
      teacher.setEikenLevel(r.state?.eikenLevel);
      eiken.setLevel(r.state?.eikenLevel);
      if (m.wallet) applyWallet(m.wallet);
      state.homeworkCount = m.homework || 0;
      state.kids = !!m.kids && m.role !== 'teacher'; chat.setFree();
      // 幼児モードの ホームは、この ページで はじめて 入った ときに 出す（記録の ある 子＝restored でも 出す。つなぎなおしでは 出さない）。
      kids.set(state.kids, { first: !state.kidsWelcomed, classOn: !!m.kidsClass, enabled: !!m.kidsMode });
      // 入ったら すぐ「せかいを えらぼう」（しまの ちず）：だれでも、この ページで はじめて 入った ときに 1 回（つなぎなおしでは 出さない）。
      // 幼児モードの ホームが 出て いる とき・ほかの 画面が ひらいて いる ときは 出さない。
      if (!state.kidsWelcomed && !kidsNow()) setTimeout(() => { try { if (!kidsNow() && !document.querySelector('dialog[open]') && !rpg.isOpen) rpg.openMap(); } catch (err) { console.warn('[net] could not open the world map', err); } }, 900);
      state.kidsWelcomed = true;
      // まだ おわって いない 宿題が あれば 1 回 おしらせ（しゅくだい島で とける）。
      // とちゅうの 宿題が あれば「まえの つづき」の カード（おすと その場で つづきから）。なければ 数の おしらせ。
      if (m.homeworkResume && !m.restored) setTimeout(() => homework.offerResume(m.homeworkResume), 3500);
      else if (m.homework > 0 && !m.restored) setTimeout(() => toast(tr('📚 しゅくだいが {0} こ あるよ。しゅくだい島へ いこう！', [m.homework])), 4000);
      // Roblox の学習データ（自分のぶん）。リンクが来たときだけボタンが出る。
      const rb = document.getElementById('roblox-button');
      if (rb) { if (m.robloxReport) { rb.href = /^https?:/i.test(m.robloxReport) ? m.robloxReport : location.origin + m.robloxReport; rb.hidden = false; } else rb.hidden = true; }
      applyProgress(m.progress);
      taskCard.set(m.tasks || null);
      if (m.islands) state.premiumIslands = m.islands;
      rpg.setPremiumLock?.(m.locked || [], m.islands || []);
      mission.setClassMission(m.missionId);
      mission.setDone(m.missionsDone);
      mission.restore(m.errand);
      quiz.restore(m.quiz);
      gym.restore(m.gym);
      battle.restore(m.battle);
      state.move = m.move || null;
      state.pet = m.pet || null;
      petBuddy.set(state.pet?.species);
      if (!viaToken) {
        restoreProgress(m.progressJson);
        if (m.position && m.restored) teleportTo(m.position, 'restore');
        toast(tr(m.role === 'teacher' ? '先生として クラス「{code}」に 入りました。' : 'クラス「{code}」に 入りました！', { code: m.classCode }));
      } else {
        toast(tr('また つながりました。'));
      }
      state.lastSent.s = ''; // force a fresh position sample
    });
    r.onMessage('fish:cast', (m) => fishing.setCastFish?.(m.fish));
    r.onMessage('wallet', (m) => { if (m.wallet) applyWallet(m.wallet); if (m.ok === false && m.error) toast(walletError(m.error)); });
    r.onMessage('answer:result', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress, m.levels); if (m.ok === false && m.error !== 'too fast') console.warn('[net] answer rejected', m); });
    r.onMessage('teleport', (m) => { teleportTo(m, m.reason); toast(tr(m.reason === 'gather' ? '{who} 先生の ところに あつまれ！' : '{who} 先生が うごかしました。', { who: m.by })); });
    r.onMessage('call', (m) => showCall(m));
    r.onMessage('notice', (m) => toast(m.text));
    for (const type of ['class:state', 'class:toast', 'class:reviewStarted', 'class:result', 'class:pause', 'class:resume', 'class:incoming', 'class:arrived', 'class:goto',
      'review:offer', 'review:start', 'review:none', 'review:result', 'review:done', 'review:error']) {
      r.onMessage(type, (m) => { if (m?.wallet) applyWallet(m.wallet); if (type === 'review:result') sfx.judge(m?.ok); classMode.handle(type, m || {}); });
    }
    r.onMessage('chat', (m) => onChat(m));
    r.onMessage('chat:blocked', (m) => chat.blocked(m.reason, m.max));
    r.onMessage('roster', (m) => teacher.onRoster(m));
    r.onMessage('teacher:ack', (m) => teacher.onAck(m));
    r.onMessage('xp', (m) => applyProgress(m, m.levels));
    r.onMessage('quiz:question', (m) => quiz.onQuestion(m));
    for (const type of ['abc:state', 'abc:ask', 'abc:result', 'abc:error']) {
      r.onMessage(type, (m) => { if (m?.progress?.level) applyProgress(m.progress); if (type === 'abc:result' && m && !m.teach) sfx.judge(m.correct); abc.handle(type, m || {}); });
    }
    for (const type of ['read:shelf', 'read:book', 'read:progress', 'read:aloud', 'read:ask', 'read:result', 'read:error']) {
      r.onMessage(type, (m) => { if (m?.wallet) applyWallet(m.wallet); if (m?.progress?.level) applyProgress(m.progress); if (type === 'read:result') sfx.judge(m?.correct); reading.handle(type, m || {}); });
    }
    r.onMessage('quiz:result', (m) => { applyWallet(m.wallet); applyProgress(m.progress); sfx.judge(m.correct); quiz.onResult(m); });
    r.onMessage('quiz:closed', (m) => quiz.onClosed(m));
    r.onMessage('quiz:error', (m) => quiz.onError(m));
    r.onMessage('gym:question', (m) => gym.onQuestion(m));
    r.onMessage('gym:result', (m) => { applyWallet(m.wallet); applyProgress(m.progress); sfx.judge(m.correct); gym.onResult(m); });
    r.onMessage('gym:closed', (m) => gym.onClosed(m));
    r.onMessage('gym:error', (m) => gym.onError(m));
    r.onMessage('eiken:question', (m) => eiken.onQuestion(m));
    r.onMessage('eiken:result', (m) => { applyWallet(m.wallet); applyProgress(m.progress); sfx.judge(m.correct); eiken.onResult(m); });
    r.onMessage('eiken:closed', (m) => eiken.onClosed(m));
    r.onMessage('eiken:error', (m) => eiken.onError(m));
    r.onMessage('interview:card', (m) => interview.onCard(m));
    r.onMessage('interview:turn', (m) => { applyProgress(m.progress); sfx.judge(m.correct); interview.onTurn(m); });
    r.onMessage('interview:done', (m) => { applyWallet(m.wallet); applyProgress(m.progress); interview.onDone(m); });
    r.onMessage('interview:closed', (m) => interview.onClosed(m));
    r.onMessage('interview:error', (m) => interview.onError(m));
    r.onMessage('conv:opened', (m) => conv.onOpened(m));
    r.onMessage('conv:reply', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress); conv.onReply(m); });
    r.onMessage('conv:closed', (m) => conv.onClosed(m));
    r.onMessage('conv:error', (m) => conv.onError(m));
    r.onMessage('race:grid', (m) => { race.onGrid(m); rpg.ride.setNext(m.gates?.[0]?.id || ''); });
    r.onMessage('race:field', (m) => race.onField({ ...m, you: state.sessionId }));
    r.onMessage('race:lights', (m) => race.onLights(m));
    r.onMessage('race:go', (m) => race.onGo(m));
    r.onMessage('race:gate', (m) => { race.onGate(m); rpg.ride.setNext(m.next || ''); });
    r.onMessage('race:box', (m) => race.onBox(m));
    r.onMessage('race:boost', (m) => { applyProgress(m.progress); race.onBoost(m); });
    r.onMessage('race:finished', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress); ride.setBest(m.bestMs || m.best || 0); rpg.ride.setNext(''); race.onFinished(m); });
    r.onMessage('race:over', (m) => race.onOver(m));
    r.onMessage('race:closed', (m) => { race.onClosed(m); rpg.ride.setNext(''); });
    r.onMessage('race:error', (m) => race.onError(m));
    // U-SPEAK GRAND PRIX. The room drives the rivals and judges every lap; this page draws
    // them and asks for nothing. See kart-game.js and server/src/game/gp.js.
    r.onMessage('gp:grid', (m) => gp.onGrid(m));
    r.onMessage('gp:lights', (m) => gp.onLights(m));
    r.onMessage('gp:go', (m) => gp.onGo(m));
    r.onMessage('gp:field', (m) => gp.onField(m));
    r.onMessage('gp:cp', (m) => gp.onCp(m));
    r.onMessage('gp:box', (m) => gp.onItem(m));
    r.onMessage('gp:boost', (m) => { applyProgress(m.progress); gp.onBoost(m); });
    r.onMessage('gp:finished', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress); ride.setBest(m.bestMs || m.best || 0); gp.onResult(m); });
    r.onMessage('gp:over', (m) => gp.onOver(m));
    r.onMessage('gp:closed', (m) => gp.onClosed(m));
    r.onMessage('gp:error', (m) => gp.onError(m));
    r.onMessage('dash:state', (m) => dash.onState(m));
    r.onMessage('quick:question', (m) => quick.onQuestion(m));
    r.onMessage('quick:result', (m) => { applyWallet(m.wallet); applyProgress(m.progress); sfx.judge(m.correct); quick.onResult(m); });
    r.onMessage('quick:error', (m) => quick.onError(m));
    r.onMessage('quick:closed', (m) => quick.onClosed(m));
    r.onMessage('wear:shop', (m) => { wardrobe.onShop(m); dressMe(m.worn, wardrobe.table); });
    r.onMessage('wear:bought', (m) => { if (m.wallet) applyWallet(m.wallet); wardrobe.onBought(m); dressMe(m.worn, wardrobe.table); });
    r.onMessage('wear:on', (m) => { wardrobe.onWorn(m); dressMe(m.worn, wardrobe.table); bag.onWorn(m); });
    r.onMessage('bag:state', (m) => bag.onState(m));
    // じてんしゃ：部屋が ことわった（もって いない・中に いる）か、部屋の ほうで おろした（id が から）。
    r.onMessage('bike:error', () => bikeRide.onRefused());
    r.onMessage('bike:on', (m) => { if (!m?.id && bikeRide.riding) bikeRide.onRefused(); });
    r.onMessage('wear:error', (m) => wardrobe.onError(m));
    r.onMessage('farm:state', (m) => { if (m.wallet) applyWallet(m.wallet); farm.onState(m); });
    r.onMessage('farm:ask', (m) => farm.onAsk(m));
    r.onMessage('farm:result', (m) => { if (m.wallet) applyWallet(m.wallet); if (m.progress) applyProgress(m.progress, m.levels); sfx.judge(m.correct); farm.onResult(m); });
    r.onMessage('farm:error', (m) => farm.onError(m));
    r.onMessage('fw:state', (m) => { if (m.wallet) applyWallet(m.wallet); fishworld.onState(m); });
    r.onMessage('fw:ask', (m) => fishworld.onAsk(m));
    r.onMessage('fw:result', (m) => { if (m.progress) applyProgress(m.progress, m.levels); sfx.judge(m.correct); fishworld.onResult(m); });
    r.onMessage('fw:catch', (m) => { if (m.wallet) applyWallet(m.wallet); fishworld.onCatch(m); });
    // のこりの 宿題の 数（幼児モードの「きょうの がくしゅう」の 札）も ここで あたらしく する。
    r.onMessage('hw:list', (m) => { state.homeworkCount = (m.items || []).filter((h) => !h.done).length; kids.refresh(); homework.onList(m); });
    r.onMessage('rm:state', (m) => roadmap.onState(m));
    r.onMessage('parent:qr', (m) => parentQr.onQr(m));
    r.onMessage('rm:up', (m) => { if (m.wallet) applyWallet(m.wallet); roadmap.onUp(m); });
    r.onMessage('hw:ask', (m) => homework.onAsk(m));
    r.onMessage('hw:result', (m) => { if (m.wallet) applyWallet(m.wallet); if (m.progress) applyProgress(m.progress); sfx.judge(m.correct); homework.onResult(m); });
    r.onMessage('hw:done', (m) => homework.onDone(m));
    r.onMessage('hw:book', (m) => { homework.close(); reading.openBook(m.id); }); // えほんの 宿題は 本を ひらく
    r.onMessage('hw:error', (m) => homework.onError(m));
    r.onMessage('fw:sold', (m) => { if (m.wallet) applyWallet(m.wallet); fishworld.onSold(m); });
    r.onMessage('fw:error', (m) => fishworld.onError(m));
    r.onMessage('wh:ask', (m) => wordhouse.onAsk(m));
    // 名簿の「先生か」が かわった（admin で true / false）。授業モードの ボタン・先生コンソールを つけなおす。
    r.onMessage('role', (m) => {
      state.role = m.role === 'teacher' ? 'teacher' : 'student';
      state.teacherId = m.teacherId || '';
      classMode.setRole(state.role);
      setMode(state.mode);
    });
    r.onMessage('kids', (m) => { state.kids = !!m.kids && state.role !== 'teacher'; chat.setFree(); kids.set(state.kids); });
    r.onMessage('food:state', (m) => food.apply(m));
    r.onMessage('food:menu', (m) => food.onMenu(m));
    r.onMessage('food:bought', (m) => food.onBought(m));
    r.onMessage('food:ate', (m) => food.onAte(m));
    r.onMessage('food:error', (m) => food.onError(m));
    r.onMessage('food:gave', (m) => foodGive.onGave(m));
    r.onMessage('food:give:error', (m) => foodGive.onError(m));
    r.onMessage('home:visit:ok', (m) => social.onVisitOk(m));
    r.onMessage('home:visit:error', (m) => social.onVisitError(m));
    r.onMessage('wh:result', (m) => { if (m.wallet) applyWallet(m.wallet); if (m.progress) applyProgress(m.progress, m.levels); sfx.judge(m.correct); wordhouse.onResult(m); });
    r.onMessage('wh:error', (m) => wordhouse.onError(m));
    r.onMessage('farm:board', (m) => farm.onBoard(m));
    r.onMessage('voice:room', (m) => voice.onRoom(m));
    r.onMessage('voice:peer', (m) => voice.onPeer(m));
    r.onMessage('voice:closed', (m) => voice.onClosed(m));
    r.onMessage('voice:error', (m) => voice.onError(m));
    r.onMessage('voice:msg', (m) => voice.onMsg(m));
    r.onMessage('voice:token', (m) => voice.onToken(m));
    r.onMessage('rtc:signal', (m) => voice.onSignal(m));
    r.onMessage('battle:state', (m) => battle.onState(m));
    r.onMessage('battle:quiz', (m) => battle.onQuiz(m));
    r.onMessage('battle:turn', (m) => { if (m.wallet) applyWallet(m.wallet); sfx.judge(m.quiz?.correct); battle.onTurn(m); });
    r.onMessage('battle:closed', (m) => battle.onClosed(m));
    r.onMessage('battle:error', (m) => battle.onError(m));
    r.onMessage('fish:learned', (m) => { state.move = m.move; if (m.wallet) applyWallet(m.wallet); dojo.onLearned(m); });
    r.onMessage('fish:error', (m) => dojo.onError(m));
    r.onMessage('pet:hatched', (m) => { state.pet = m.pet; petBuddy.set(m.pet?.species); if (m.wallet) applyWallet(m.wallet); petUI.onHatched(m); });
    r.onMessage('pet:acted', (m) => { state.pet = m.pet; petBuddy.set(m.pet?.species); if (m.wallet) applyWallet(m.wallet); petUI.onActed(m); });
    r.onMessage('pet:error', (m) => petUI.onError(m));
    r.onMessage('block:shop', (m) => { town.onShop(m); rememberBlocks(m); });
    r.onMessage('block:bought', (m) => { if (m.wallet) applyWallet(m.wallet); town.onBought(m); rememberBlocks(m); blockwild.refresh(); });
    // BLOCKWILD の中の店：棚、買えた、買えなかった。
    r.onMessage('bw:shop', (m) => { if (Array.isArray(m.gear)) shelf.gear = m.gear; rememberBlocks(m); blockwild.onShop(m); });
    r.onMessage('bw:bought', (m) => { if (m.wallet) applyWallet(m.wallet); blockwild.onBought(m); });
    r.onMessage('bw:error', (m) => blockwild.onError(m));
    r.onMessage('kart:quiz', (m) => kartWait.start.get(m.ref)?.resolve(m));
    r.onMessage('kart:result', (m) => { if (m.wallet) applyWallet(m.wallet); kartWait.answer.get(`${m.id}:${m.i}`)?.resolve(m); });
    r.onMessage('kart:error', (m) => { (m.ref ? kartWait.start.get(m.ref) : kartWait.answer.get(`${m.id}:${m.i}`))?.reject(new Error(m.reason)); });
    r.onMessage('block:error', (m) => town.onError(m));
    r.onMessage('room:state', (m) => town.onRoomState(m));
    r.onMessage('room:placed', (m) => town.onPlaced(m));
    r.onMessage('room:removed', (m) => town.onRemoved(m));
    r.onMessage('room:moved', (m) => { if (m.wallet) applyWallet(m.wallet); town.onMoved(m); });
    r.onMessage('land:state', (m) => land.onState(m));
    r.onMessage('land:bought', (m) => { if (m.wallet) applyWallet(m.wallet); land.onBought(m); });
    r.onMessage('land:island', (m) => land.onIsland(m));
    r.onMessage('land:board', (m) => land.onBoard(m));
    r.onMessage('land:error', (m) => land.onError(m));
    r.onMessage('room:error', (m) => town.onError(m));
    r.onMessage('prop:shop', (m) => town.onPropShop(m));
    r.onMessage('prop:bought', (m) => { if (m.wallet) applyWallet(m.wallet); town.onPropBought(m); });
    r.onMessage('prop:error', (m) => town.onError(m));
    r.onMessage('plaza:state', (m) => town.onPlazaState(m));
    r.onMessage('plaza:placed', (m) => town.onPlazaPlaced(m));
    r.onMessage('plaza:removed', (m) => town.onPlazaRemoved(m));
    r.onMessage('plaza:error', (m) => town.onPlazaError(m));
    r.onMessage('ride:garage', (m) => ride.onGarage(m));
    r.onMessage('ride:bought', (m) => { if (m.wallet) applyWallet(m.wallet); ride.onBought(m); });
    r.onMessage('ride:error', (m) => ride.onError(m));
    r.onMessage('world:phase', (m) => night.setPhase(m));
    r.onMessage('night:ghosts', (m) => { night.setGhosts(m.ghosts); if (m.caught) night.pop(m.caught); });
    r.onMessage('ghost:caught', (m) => { if (m.wallet) applyWallet(m.wallet); night.onCaught(m); });
    r.onMessage('ghost:error', (m) => night.onError(m));
    r.onMessage('login:bonus', (m) => {
      if (m.wallet) applyWallet(m.wallet);
      const firstDay = m.streak === 1;
      daily.onBonus(m, { quiet: firstDay });
      if (firstDay) toast(tr('🎁 ようこそ！ {n} コイン もらったよ', { n: m.coins }));
    });
    r.onMessage('rank', (m) => daily.onRank(m));
    r.onMessage('levelup', (m) => toast(tr('{who} が レベル {n} に なりました！', { who: m.name, n: m.level })));
    r.onMessage('mission:opened', (m) => mission.onOpened(m));
    r.onMessage('mission:arrived', (m) => mission.onArrived(m));
    r.onMessage('mission:turn', (m) => { applyProgress(m.progress, m.levels); mission.onTurn(m); });
    r.onMessage('mission:delivered', (m) => { if (m.wallet) applyWallet(m.wallet); applyProgress(m.progress); mission.onDelivered(m); });
    r.onMessage('mission:closed', (m) => mission.onClosed(m));
    r.onMessage('mission:error', (m) => mission.onError(m));
    r.onMessage('progress:ack', () => {});
    r.onMessage('pong', () => { clearTimeout(probeTimer); probeTimer = null; });

    const seen = new Map();
    r.state.players.onAdd((p, id) => {
      if (id === r.sessionId) { chip.count(r.state.players.size); return; }
      remotes.upsert(id, snapshot(p));
      remotes.pushSample(id, { x: p.x, z: p.z, yaw: p.yaw });
      seen.set(id, { x: p.x, z: p.z, yaw: p.yaw });
      p.onChange(() => {
        remotes.upsert(id, snapshot(p));
        const prev = seen.get(id);
        if (!prev || prev.x !== p.x || prev.z !== p.z || prev.yaw !== p.yaw) {
          remotes.pushSample(id, { x: p.x, z: p.z, yaw: p.yaw });
          seen.set(id, { x: p.x, z: p.z, yaw: p.yaw });
        }
      });
      chip.count(r.state.players.size);
    });
    r.state.players.onRemove((p, id) => { remotes.remove(id); seen.delete(id); chip.count(r.state.players.size); });
    r.state.listen('chatPaused', (v) => { state.chatPaused = !!v; chat.setPaused(); teacher.setChatPaused(!!v); });
    r.state.listen('freeChat', (v) => { state.freeChat = v !== false; chat.setFree(); voice.setFree(state.freeChat); teacher.setFree(state.freeChat); });
    r.state.listen('voice', (v) => { voice.setMode(v); teacher.setVoice(v); });
    // 英検の はんていの きびしさ。先生が変えると、その場で 全員の画面の札が変わる。
    r.state.listen('eikenLevel', (v) => { teacher.setEikenLevel(v); eiken.setLevel(v); });
    r.state.listen('stageOpen', (v) => voice.setStage(v));
    r.state.listen('teacherId', (v) => { state.teacherId = v || ''; });
    r.state.listen('missionId', (v) => { mission.setClassMission(v); teacher.setMission(v); });

    r.onError((code, message) => console.warn('[net] room error', code, message));
    r.onLeave((code) => {
      clearTimeout(probeTimer); probeTimer = null;
      if (room !== r) return;
      room = null;
      if (state.intentionalLeave) { setMode('offline'); return; } // ログアウト（ロビーは logout が ひらく）
      // 停止（admin の 名簿）：つなぎなおさず、わけを 言って ロビーへ。
      if (code === 4008) {
        storage.remove(sessionStorage, STORAGE_KEYS.session);
        setMode('offline');
        lobby.open({ error: tr('この アカウントは いま つかえません。先生に きいてね。') });
        return;
      }
      console.info('[net] connection lost', code);
      setMode('reconnecting');
      scheduleReconnect(0);
    });
    // Safety net: if no welcome arrives (should not happen), do not stay "connecting" forever.
    setTimeout(() => { if (room === r && !welcomed) { console.warn('[net] no welcome received; retrying'); r.leave(false); } }, 8000);
  }

  function snapshot(p) { return { name: p.name, avatar: p.avatar, role: p.role, space: p.space, x: p.x, z: p.z, yaw: p.yaw, anim: p.anim, connected: p.connected }; }

  function scheduleReconnect(delay) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(attemptReconnect, delay);
  }

  async function attemptReconnect() {
    if (state.mode !== 'reconnecting' || room) return;
    const session = storage.get(sessionStorage, STORAGE_KEYS.session) || {};
    try {
      let r = null;
      if (session.token) {
        try { r = await client.reconnect(session.token); } catch (err) { console.info('[net] token reconnect failed, joining by name:', err?.message || err); }
      }
      const viaToken = !!r;
      if (!r) r = await client.joinOrCreate('class', joinOptions());
      bind(r, viaToken);
    } catch (err) {
      // 名簿に ことわられた（停止・先生パスワード・名簿に ない・クラスコード）は、何回 やっても 同じ。
      // やりなおさず すぐ ロビーへ（前は 40 回・約 3 分「つなぎ なおしています…」の まま 止まって 見えた）。
      if ([4004, 4005, 4007, 4008].includes(err?.code)) {
        storage.remove(sessionStorage, STORAGE_KEYS.session);
        setMode('offline');
        lobby.open({ error: friendlyError(err), name: state.name, teacher: err?.code === 4005 });
        return;
      }
      state.attempts += 1;
      if (state.attempts >= NET.RECONNECT_MAX_ATTEMPTS) {
        setMode('offline');
        lobby.open({ error: tr('つなぎ なおせませんでした。もう一度 入って ください。') });
        return;
      }
      const delay = NET.RECONNECT_DELAYS_MS[Math.min(state.attempts, NET.RECONNECT_DELAYS_MS.length - 1)];
      console.info(`[net] reconnect attempt ${state.attempts} failed (${err?.message || err}); retry in ${delay}ms`);
      scheduleReconnect(delay);
    }
  }

  // Called when the page becomes visible / online again. Proves the socket within
  // RESUME_PROBE_TIMEOUT_MS or forces a reconnect, so resume-after-lock stays under 3 s.
  function resume() {
    state.resumedAt = performance.now();
    if (state.mode === 'reconnecting') { scheduleReconnect(0); return; }
    if (state.mode !== 'online' || !room) return;
    if (!room.connection?.isOpen) { room.leave(false); return; }
    if (probeTimer) return;
    room.send('ping', Date.now());
    probeTimer = setTimeout(() => {
      probeTimer = null;
      console.info('[net] resume probe timed out; forcing reconnect');
      room?.leave(false);
    }, NET.RESUME_PROBE_TIMEOUT_MS);
  }

  // ログアウト：クラスから でて、この ブラウザが おぼえている なまえ・クラスも わすれる（つぎの 人が つかえる）。
  function logout() {
    if (!confirm(tr('ログアウトしますか？ ユーザーネームと パスワードを わすれます。'))) return;
    leaveClass();
    storage.remove(localStorage, STORAGE_KEYS.prefs);
    state.name = ''; state.classCode = ''; state.teacherKey = ''; state.pin = ''; state.role = 'student';
    classMode.setRole('student');
    lobby.reset();
    lobby.open();
  }
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'logout-button';
    b.className = 'logout-button';
    b.hidden = true;
    b.textContent = '⏏';
    b.setAttribute('aria-label', 'ログアウト');
    b.dataset.tLabel = 'ログアウト';
    b.title = tr('ログアウト');
    b.onclick = logout;
    document.querySelector('#lang-toggle')?.after(b);
  }

  // クラスから でる（ログアウト・やめる）。ひとりで あそぶ（オフライン）は 2026-10 に なくした ので、でたら いつも ロビー。
  function leaveClass() {
    state.intentionalLeave = true;
    clearTimeout(reconnectTimer);
    clearSession();
    const r = room; room = null;
    r?.leave(true);
    remotes.clear();
    setMode('offline');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume();
    else { state.hiddenAt = performance.now(); syncProgress(true); }
  });
  addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
  addEventListener('pagehide', () => { syncProgress(true); });
  addEventListener('online', () => resume());
  // 言語を切り替えたら、つながりの札を書き直す（そこだけ前の言語で残るのが目につく）。
  onLangChange(() => { chip.refresh(); setMode(state.mode); });

  addEventListener('offline', () => { if (state.mode === 'online') chip.set('reconnecting', tr('つながりが きれました…')); });

  // ---- server-authoritative wallet & progress ---------------------------------------

  // Level and XP are the server's, for the same reason coins are: they end up on a
  // parent's report. Offline the local reckoning still runs; online this wins.
  function applyProgress(p, levels = 0) {
    if (!p || typeof p !== 'object') return;
    state.progress = p;
    writeProgress();
    main?.refresh();
    if (levels > 0) toast(tr('レベル {n} に なった！', { n: p.level }));
  }

  function writeProgress() {
    const p = state.progress;
    if (!p || state.mode === 'offline') return;
    const level = document.querySelector('#level');
    const xp = document.querySelector('#xp');
    // Rewritten every frame because the offline reckoning in game.js and rpg.js also
    // owns these two elements and repaints them on its own schedule.
    if (level && level.textContent !== String(p.level)) level.textContent = String(p.level);
    const total = p.total.toLocaleString();
    if (xp && xp.textContent !== total) xp.textContent = total;
  }

  function applyWallet(w) {
    state.wallet = w;
    main?.refresh();
    // Roblox と同じ財布の子には、1度だけ言っておく：ここで ふえたぶんは Roblox に入ると届く。
    if (w?.roblox && !state.robloxNoted) {
      state.robloxNoted = true;
      toast(tr('コインは Roblox と おなじです。ここで ふえたぶんは、Roblox に 入ると 反映されます。'));
      document.getElementById('coin-hud')?.setAttribute('title', tr('Roblox に 入ると 反映されます'));
    }
    try {
      fishing.store.reconcile?.(w);
      fishing.refreshWallet?.();
    } catch (err) { console.warn('[net] wallet reconcile failed', err); }
  }
  // テーマパークの のりもの代。オンラインは 部屋が はらう（へんじを まつ）。オフラインは null（ページの さいふで はらう）。
  function parkPay(id) {
    if (state.mode !== 'online' || !room) return null;
    return new Promise((resolve) => {
      const offs = [];
      const done = (v) => { clearTimeout(timer); offs.forEach((off) => off?.()); resolve(v); };
      const timer = setTimeout(() => done({ ok: false, reason: 'timeout' }), 6000);
      offs.push(room.onMessage('park:ride:ok', (m) => { if (m.wallet) applyWallet(m.wallet); done({ ok: true, price: m.price }); }));
      offs.push(room.onMessage('park:ride:error', (m) => { if (m.wallet) applyWallet(m.wallet); done({ ok: false, reason: m.reason }); }));
      room.send('park:ride', { id });
    });
  }
  function walletError(e) {
    const known = { 'not enough coins': 'コインが たりません。', 'already owned': 'もう もっています。', 'nothing to sell': 'うれる さかなが ありません。', 'sell cap': 'きょうは もう うれないよ。あした また うってね。', 'no cast': 'もう いちど さおを なげてね。' }[e];
    return known ? tr(known) : tr('サーバーが うけつけませんでした: {why}', { why: e });
  }
  function restoreProgress(json) {
    if (!json) return;
    try {
      const local = rpg.adventure?.progress?.state;
      if (local?.starter) return; // this device already has a journey; keep it
      const data = JSON.parse(json);
      rpg.adventure.progress.restore(data);
      rpg.activate('willow', true, true);
      rpg.syncBuddy?.(true);
      toast(tr('まえの つづきを よみこみました。'));
    } catch (err) { console.warn('[net] progress restore failed', err); }
  }
  function syncProgress(force = false) {
    if (!room || state.mode !== 'online' || !rpg.adventure?.progress) return;
    const now = performance.now();
    if (!force && now - state.lastProgressAt < NET.PROGRESS_SYNC_MS) return;
    let json = '';
    try { json = JSON.stringify(rpg.adventure.progress.backup()); } catch { return; }
    state.lastProgressAt = now;
    if (json === state.lastProgressJson) return;
    state.lastProgressJson = json;
    room.send('progress', { json });
  }
  hooks.on('answer', ({ q, c }) => { if (room && state.mode === 'online') room.send('answer', { q, c }); });
  // U-Speak島の つり：どの 魚が かかるかは 部屋が 決める（ページの くじは オフラインの ときだけ）。
  hooks.on('fishcast', (m) => { if (room && state.mode === 'online') room.send('fish:cast', m); });
  hooks.on('economy', (op) => { if (room && state.mode === 'online') room.send('economy', op); });

  // ---- teleport (teacher commands, restore) -----------------------------------------

  // 授業モードの「みんなで いどう」：開いている 画面を 閉じ、ひこうきを 待たずに その 島へ（先生も 生徒も）。
  // メインの島の 英単語ハウスは その 戸口の 前に 立たせる。うまく 行かなければ false（画面は 25 秒で もどる）。
  function goPlace(m) {
    try {
      for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'net-lobby') d.close();
      if (rpg.isOpen) rpg.close();
      if (fishing.state.busy) fishing.cancel?.();
      if (rpg.adventure?.magic?.interior?.active) rpg.leaveSanctuary();
      if (rpg.state.mode === 'flight') rpg.finishFlight();
      rpg.activate(m.island || m.to, true, true);
      if (m.to !== (m.island || m.to)) {
        const isl = rpg.main?.data;
        const s = isl?.spots?.find((x) => x.id === m.to);
        if (s) player.position.set(isl.x + s.x, 0, isl.z + s.z + 4);
      }
      state.lastSent.s = '';
      return rpg.state.current === (m.island || m.to);
    } catch (err) { console.warn('[net] class move failed', err); return false; }
  }
  function teleportTo(target, reason = 'move') {
    if (!target || typeof target.space !== 'string' || target.space.startsWith('in:')) return false;
    state.pendingTeleport = { space: target.space, x: Number(target.x) || 0, z: Number(target.z) || 0, reason };
    return applyPendingTeleport();
  }
  function applyPendingTeleport() {
    const t = state.pendingTeleport;
    if (!t) return false;
    if (park.state.busy) return false; // mid-ride: applied on the next frame it is free
    try {
      for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'net-lobby') d.close();
      if (rpg.isOpen) rpg.close();
      if (fishing.state.busy) fishing.cancel?.();
      if (rpg.adventure?.magic?.interior?.active) rpg.leaveSanctuary();
      social?.leaveHome(true);   // 住民の いえの 中から よばれた ときは 先に 出る
      library?.leave(true, false);   // としょかんの 中からも
      planetarium?.leave(true, false);   // プラネタリウムの 中からも
      if (rpg.state.mode === 'flight') rpg.finishFlight();
      if (rpg.state.current !== t.space) rpg.activate(t.space, true, true);
      player.position.set(t.x, 0, t.z);
      state.lastSent.s = '';
    } catch (err) { console.warn('[net] teleport failed', err); }
    state.pendingTeleport = null;
    return true;
  }
  function showCall(m) {
    let el = $('#net-call');
    if (!el) { el = document.createElement('div'); el.id = 'net-call'; document.body.append(el); }
    el.innerHTML = `<span>📢 ${escapeHtml(tr('{who} 先生が 呼んでいます', { who: m.by }))}</span><button type="button" id="net-call-go">${escapeHtml(tr('先生の ところへ 行く'))}</button><button type="button" class="secondary" id="net-call-later">${escapeHtml(tr('あとで'))}</button>`;
    $('#net-call-go').onclick = () => { teleportTo(m, 'call'); el.remove(); };
    $('#net-call-later').onclick = () => el.remove();
    speak?.('Please come here!');
  }

  // ---- chat -----------------------------------------------------------------------

  function onChat(m) {
    const mine = m.from === state.sessionId;
    chat.receive({ name: m.name, id: m.id, text: m.text, mine });
    // Over the head as well as in the panel — a written word belongs to the child who
    // wrote it, whether they tapped a phrase or typed their own.
    const bubble = typeof m.text === 'string' && m.text ? m.text : chat.phrase(m.id)?.en;
    if (!bubble) return;
    if (mine) {
      if (ownBubble) player.remove(ownBubble);
      ownBubble = remotes.textSprite(bubble, { bg: '#fffaf0', color: '#263d33', size: 28, width: 640, scale: 0.62 });
      ownBubble.position.set(0, 3.95, 0);
      player.add(ownBubble);
      ownBubbleUntil = performance.now() + NET.CHAT_BUBBLE_MS;
    } else {
      remotes.showBubble(m.from, bubble);
    }
  }

  // Where the child is, now. Sent twenty times a second by the frame below, and by hand
  // just before anything that the server answers by asking where they are standing: the
  // socket keeps the order, so the position lands first and the question is asked from
  // the right place rather than from wherever they were a tenth of a second ago.
  function sendMove(anim = 'idle') {
    if (!room || state.mode !== 'online') return;
    const s = currentSpace();
    const x = round(player.position.x, 2), z = round(player.position.z, 2), r = round(player.rotation.y, 3);
    room.send('move', { s, x, z, r, a: anim, t: Date.now() % 4294967296 });
    state.lastSent = { s, x, z, r, a: anim };
    state.lastSendAt = performance.now();
  }

  // ---- per-frame ----------------------------------------------------------------

  function update(t, dt, { moving = false, running = false } = {}) {
    petBuddy.update(dt, moving);
    foodGive.update(t, dt);
    bikeRide.update(t, dt);
    taskGuide.update(t);
    const now = performance.now();
    if (state.pendingTeleport) applyPendingTeleport();
    if (ownBubble && now > ownBubbleUntil) { player.remove(ownBubble); ownBubble = null; }
    const space = currentSpace();
    remotes.update(t, space);
    // 同梱ゲームはこのページの中だけで完結するので、入口はオフラインでも出す
    // （オンラインだけの判定より前に置いてあるのはそのため）。
    guestDock.show(space);
    writeProgress();
    if (!room || state.mode !== 'online') return;
    const anim = rpg.state.mode === 'flight' ? 'fly' : moving ? (running ? 'run' : 'walk') : 'idle';
    // Arriving on (or leaving) the island changes what the errand tracker has to say.
    if (space !== state.lastSpace) { state.lastSpace = space; mission.refreshHud(); }
    voice.setMode(room.state?.voice);
    voice.setSpace(space);
    if (now - state.lastSendAt >= 1000 / NET.SEND_HZ) {
      const s = currentSpace();
      const x = round(player.position.x, 2), z = round(player.position.z, 2), r = round(player.rotation.y, 3);
      const last = state.lastSent;
      const changed = s !== last.s || x !== last.x || z !== last.z || r !== last.r || anim !== last.a;
      if (changed || now - state.lastSendAt >= NET.HEARTBEAT_MS) sendMove(anim);
    }
    const avatarJson = JSON.stringify(avatars.config);
    if (avatarJson !== state.lastAvatarJson) { state.lastAvatarJson = avatarJson; room.send('profile', { avatar: avatars.config }); }
    syncProgress(false);
  }

  // ---- boot ---------------------------------------------------------------------

  function createStatusChip() {
    const el = document.createElement('button');
    el.id = 'net-status';
    el.type = 'button';
    el.className = 'offline';
    el.innerHTML = `<i></i><b class="net-count" hidden></b><span class="net-label">${escapeHtml(tr('オフライン'))}</span>`;
    el.onclick = () => {
      if (state.mode === 'online' || state.mode === 'reconnecting') return;
      lobby.open({ name: state.name });
    };
    document.body.append(el);
    // The count lives in its own element so narrow screens can hide the words
    // and still show how many people are in the room (see mobile.css).
    const write = (cls, label, n) => {
      el.className = cls;
      el.querySelector('.net-label').textContent = label;
      const b = el.querySelector('.net-count');
      // 数の単位も言語で変わる（英語で「1人」とだけ出ていた）。
      b.textContent = n == null ? '' : tr('{n}人', { n });
      b.hidden = n == null;
    };
    return {
      set(cls, text) { write(cls, text, cls === 'online' ? (room?.state?.players?.size ?? 1) : null); },
      count(n) { if (state.mode === 'online') write('online', tr('オンライン'), n); },
      refresh() { if (state.mode === 'online' && room) write('online', tr('オンライン'), room.state.players.size); },
    };
  }

  function boot() {
    // つうしんの ぶひんが ないと クラスに 入れない（ひとりで あそぶは もう ない）。ロビーで そう いう。
    if (!Colyseus) { const show = () => lobby.open({ error: tr('つうしんの ぶひんが よみこめませんでした。') }); if (avatars.first) $('#avatar-dialog')?.addEventListener('close', show, { once: true }); else show(); return; }
    const session = storage.get(sessionStorage, STORAGE_KEYS.session);
    const start = () => {
      if (session?.name) {
        // Same tab reloaded (or restored by Safari): rejoin automatically.
        state.name = session.name; state.classCode = session.classCode || ''; state.teacherKey = session.teacherKey || ''; state.pin = session.pin || '';
        client = new Colyseus.Client(resolveServerUrl());
        setMode('reconnecting');
        homeNow();
        scheduleReconnect(0);
      } else {
        lobby.open();
      }
    };
    if (avatars.first) $('#avatar-dialog')?.addEventListener('close', start, { once: true });
    else start();
  }
  boot();

  return {
    // 検査用：左の タスクの カードと 光の道。
    tasks: { card: taskCard, guide: taskGuide },
    update, teleportTo, currentSpace, parkPay,
    get online() { return state.mode === 'online'; },
    get role() { return state.role; },
    get mode() { return state.mode; },
    get sessionId() { return state.sessionId; },
    get room() { return room; },
    get wallet() { return state.wallet; },
    get remotes() { return remotes; },
    get gp() { return gp; },
    // えいごアリーナの 3D の 舞台が 島の renderer を 使って いる あいだ（game.js は 島を 描かない）。
    get battleStage() { return { running: battle.staged, stage: battle.stage }; },
    get dash() { return dash; },
    get roadmap() { return roadmap; },
    get quick() { return quick; },
    get wardrobe() { return wardrobe; },
    get racers() { return racers; },
    get blockwild() { return blockwild; },
    guestDock,
    get arcades() { return arcades; },
    // One question for the frame loop: is a whole-window guest game up?
    arcadeOpen: () => racers.isOpen || blockwild.isOpen || Object.values(arcades).some((g) => g.isOpen),
    // じどうで あるく（タスクの カードの ボタン）。game.js が 毎フレーム 向きを もらう。
    autoWalk: () => taskGuide.steer(),
    autoWalkStop: () => taskGuide.stopWalk(),
    readingLabel: (spot) => `${spot?.tone || '📚'} ${tr('えほんを よむ')}`,
    abcLabel: (spot) => `${spot?.tone || '🔤'} ${tr('ABC と おと')}`,
    reading, abc,
    homeworkLabel: (spot) => `${spot?.tone || '📚'} ${tr('しゅくだいを する')}`,
    homework,
    miniLabel: (spot) => `${spot?.tone || '🎮'} ${tr('{what} で あそぶ', { what: spot?.name || tr('ゲーム') })}`,
    openLobby: () => lobby.open({ name: state.name }),
    openMission: () => mission.open(),
    errandInteract: () => { const near = rpg.errandNearby(); if (near) mission.interact(near.spot); },
    errandLabel: (spot) => mission.label(spot) || tr('{who} と 話す', { who: spot.character }),
    schoolInteract: () => {
      const near = rpg.schoolNearby();
      if (!near) return;
      if (near.spot.kind === 'gym') gym.enter(near.spot); else quiz.enter(near.spot);
    },
    schoolLabel: (spot) => (spot.kind === 'gym' ? gym.label(spot) : quiz.label(spot)),
    convInteract: () => {
      const near = rpg.convNearby();
      if (near) conv.enter(near.spot.id);
    },
    convLabel: (spot) => conv.label(spot),
    eikenInteract: () => {
      const near = rpg.eikenNearby();
      // Four of the five buildings are a skill; the fifth is the interview room, and
      // which one a child walked into is which screen opens. There is no menu.
      if (near?.spot?.kind === 'interview') interview.enter(near.island);
      else if (near) eiken.enter(near.spot, near.island);
    },
    eikenLabel: (spot) => (spot?.kind === 'interview' ? interview.label() : eiken.label(spot)),
    arenaInteract: () => {
      const near = rpg.arenaNearby();
      if (!near) return;
      if (near.spot.kind === 'dojo') dojo.enter(near.spot); else battle.enter(near.spot);
    },
    arenaLabel: (spot) => (spot.kind === 'dojo' ? dojo.label(spot) : battle.label(spot)),
    petInteract: () => { const near = rpg.petNearby(); if (near) petUI.enter(near.spot); },
    // きせかえ島: the shop you walked into is the kind of thing you are shopping for, so
    // the panel opens on that slot rather than on whatever it showed last time.
    wearInteract: () => { const near = rpg.wearNearby(); if (near) wardrobe.open({ slot: near.spot.slot || near.spot.kind }); },
    wearLabel: (spot) => tr('{shop}で きせかえる', { shop: spot?.name || tr('お店') }),
    farmInteract: () => { const near = rpg.farmNearby(); if (near) farm.open(near.spot.id); },
    // Standing on a plot or in the pen: the small card for that one place.
    farmFieldInteract: () => { const at = rpg.farmFieldNearby(); if (at) farm.openAt(at); },
    farmFieldLabel: (at) => farm.labelAt(at),
    farmLabel: (spot) => farm.label(spot),
    farm,
    petLabel: (spot) => petUI.label(spot),
    town, myRoom, myPlaza, voice, conv, race, daily,
    // Whichever of the two a child is standing in. The page's E and Q keys work on it.
    get builder() { return myRoom.active ? myRoom : myPlaza.active ? myPlaza : null; },
    townInteract: () => { const near = rpg.townNearby(); if (near) town.enter(near.spot); },
    townLabel: (spot) => town.label(spot),
    landInteract: () => { const near = rpg.landNearby(); if (near) { sendMove(); land.enter(near.spot); } },
    fishworldInteract: () => { const near = rpg.fishworldNearby(); if (near) { sendMove(); fishworld.enter(near.spot, { auto: true }); } },
    // 水辺に 立ったら すぐ つりはじめる（1 回 来るごとに 1 回。はなれれば また）。毎フレーム game.js が呼ぶ。
    fishworldAuto: (near) => {
      const id = near?.spot?.id || '';
      if (!id) { fwAutoAt = ''; return; }
      if (fwAutoAt === id || state.mode !== 'online' || fishworld.isOpen || fishworld.busy || document.querySelector('dialog[open]')) return;
      fwAutoAt = id;
      sendMove();
      fishworld.enter(near.spot, { auto: true });
    },
    fishworldLabel: () => tr('🎣 ここで つる'),
    mainInteract: () => { const near = rpg.mainNearby(); if (near) { sendMove(); main.walkIn(near.spot); } },
    mainLabel: (spot) => main.label(spot),
    fishworld,
    wordhouse,
    food, foodGive, social,
    bag,
    // じてんしゃ（bike-ride.js）：game.js が はやさ（step）と キー、検査が riding を 見る。
    bike: bikeRide, bikeShop,
    main,
    landLabel: (spot) => land.label(spot),
    land, myLand,
    ride,
    rideInteract: () => { const near = rpg.rideNearby(); if (near) ride.enter(near.spot); },
    rideLabel: (spot) => ride.label(spot),
    // The world tells us when the avatar drives into a checkpoint ring.
    // How fast this child moves: 1 on foot, more on a vehicle they own.
    // おなかが 0 だと おそく（どの島でも）。
    speed: () => (state.mode === 'online' ? state.speed * food.speedFactor() : 1),
    night,
    // The world's own time. Offline this is simply the device's clock, so the sky still
    // turns for a child playing alone.
    serverNow: () => Date.now() + state.skew,
    ghostNearby: () => night.nearby(currentSpace()),
    ghostLabel: (near) => night.label(near),
    ghostSwing: () => night.swing(currentSpace()),
    leave: () => { leaveClass(); lobby.open({ name: state.name }); },
  };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

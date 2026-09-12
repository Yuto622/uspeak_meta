// Colyseus state schema. Only fields every client needs are public here; wallets,
// inventories and learning stats live server-side and go to the owner via messages.
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

export const ANIMS = ['idle', 'walk', 'run', 'fly'];

export class Player extends Schema {
  constructor() {
    super();
    this.name = '';
    this.avatar = '{"id":"kai"}';
    this.role = 'student';
    this.level = 1;
    this.space = 'willow';
    this.x = 3;
    this.z = 8;
    this.yaw = 0;
    this.anim = 'idle';
    this.ts = 0;
    this.connected = true;
  }
}
defineTypes(Player, {
  name: 'string',
  avatar: 'string',
  role: 'string',
  level: 'uint16',
  space: 'string',
  x: 'float32',
  z: 'float32',
  yaw: 'float32',
  anim: 'string',
  ts: 'uint32',
  connected: 'boolean',
});

export class RoomState extends Schema {
  constructor() {
    super();
    this.classCode = '';
    this.chatPaused = false;
    // じゆうにゅうりょく. Children may type their own words as well as tap a preset
    // phrase. It starts on — a chat a child cannot answer in their own words is not a
    // chat — and a teacher can turn it off for the class in one tap when a lesson needs
    // the phrases and nothing else.
    this.freeChat = true;
    // 通話. Three settings, not two: 'all' (the default — every building on every island,
    // plus おはなし島 itself), 'rooms' (おはなし島 and nowhere else) and 'off' (a teacher
    // has closed all of it, おはなし島 included). A class starts open: a child who walks
    // into a building is in the call with whoever else is inside, and nobody had to switch
    // anything on for that to be true.
    this.voice = 'all';
    // Whether this server has an SFU behind it, and so whether おはなし島's plaza is a
    // hall for a hundred or a room for six. The page needs to know before anybody taps.
    this.stageOpen = false;
    this.teacherId = '';
    this.missionId = '';
    this.players = new MapSchema();
  }
}
defineTypes(RoomState, {
  classCode: 'string',
  chatPaused: 'boolean',
  freeChat: 'boolean',
  voice: 'string',
  stageOpen: 'boolean',
  teacherId: 'string',
  missionId: 'string',
  players: { map: Player },
});

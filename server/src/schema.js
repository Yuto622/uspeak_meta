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
    this.teacherId = '';
    this.missionId = '';
    this.players = new MapSchema();
  }
}
defineTypes(RoomState, {
  classCode: 'string',
  chatPaused: 'boolean',
  teacherId: 'string',
  missionId: 'string',
  players: { map: Player },
});

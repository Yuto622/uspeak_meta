// 大広間 — the rooms a mesh cannot hold.
//
// Six children in a building talk browser to browser: ten connections, no server in the
// middle, nothing to pay for. A hundred children in one place cannot do that — each
// browser would hold ninety-nine connections and send its voice ninety-nine times — so a
// room that size runs through an SFU (LiveKit), which takes each voice once and forwards
// it to whoever is listening.
//
// What lives here is the decision and the ticket, not the media: this server never sees a
// voice either way. The API key and secret are read from the environment and never leave
// the process; what the browser gets is a token minted here for one room, one child and a
// couple of hours, saying exactly what that child may publish. A child cannot ask for a
// different room or for a camera they were not given, because the answer is signed.
import { createHmac } from 'node:crypto';
import { config } from '../config.js';

// A hundred is the number asked for: a whole school in one plaza. The SFU itself would go
// further; a Fly.io machine and a school's Wi-Fi are the real limits, and both are
// happier when only a few of the hundred are publishing a camera.
export const STAGE_MAX = 100;

// Configured, or not. Without all three there is no SFU, and big rooms fall back to a
// six-child mesh rather than failing — a class of six still works on a bare server.
export const stageReady = () => !!(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret);

export const stageUrl = () => config.livekit.url;

// LiveKit room names travel in URLs and logs, so they are kept to plain characters. The
// class code is part of the name: two classes standing on the same island are two rooms,
// and neither can hear the other.
export function stageRoomName(classCode, space) {
  const clean = (s) => String(s || '').replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 40);
  return `${clean(classCode) || 'class'}__${clean(space) || 'room'}`;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// A LiveKit access token is a plain HS256 JWT — no SDK needed for it, and one less
// dependency to keep current. The claims say who this is and what they may do; the
// signature is what makes them true.
export function mintToken({ room, identity, name = '', camera = false, screen = false, ttlSec = config.livekit.tokenTtlSec }) {
  if (!stageReady()) return '';
  if (!room || !identity) return '';
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = {
    iss: config.livekit.apiKey,
    sub: String(identity),
    name: String(name).slice(0, 40),
    nbf: now - 10,               // a little slack: a classroom's clocks are not atomic
    exp: now + Math.max(60, ttlSec),
    video: {
      room: String(room),
      roomJoin: true,
      canSubscribe: true,        // everyone hears everyone
      canPublish: true,
      canPublishData: false,     // the written channel is this server's, not the SFU's
      // A hundred cameras is not a lesson, it is a Wi-Fi outage. Children publish a
      // microphone; a teacher, and a child the teacher has put on the stage, may also
      // publish a camera and a screen.
      canPublishSources: ['microphone', ...(camera ? ['camera'] : []), ...(screen ? ['screen_share', 'screen_share_audio'] : [])],
    },
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = b64url(createHmac('sha256', config.livekit.apiSecret).update(body).digest());
  return `${body}.${sig}`;
}

// Reading a token back, for tests and for a log line that has to say what was handed out.
// Never used to trust anything: the SFU checks the signature, this only looks.
export function readToken(token) {
  const [, payload] = String(token || '').split('.');
  if (!payload) return null;
  try { return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { return null; }
}

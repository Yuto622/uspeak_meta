// Thin WebSocket client for the U-Speak Racers rooms.
//
// The server relays; it never simulates. Every client drives its own kart and streams
// its position; the room host additionally streams the CPU karts so that the computer
// racers stay identical on everyone's screen. Clocks are aligned with a ping/pong
// offset so a shared start time and interpolation buffers mean the same instant.
export class Net {
  constructor() {
    this.socket = null; this.id = 0; this.code = ''; this.isHost = false;
    this.players = []; this.settings = {}; this.offset = 0; this.latency = 999;
    this.handlers = new Map(); this.state = 'idle'; this.bestSample = Infinity;
  }
  on(type, fn) { const list = this.handlers.get(type) || []; list.push(fn); this.handlers.set(type, list); return this }
  emit(type, message) { for (const fn of this.handlers.get(type) || []) fn(message); }
  // Server time. Everything scheduled between players is expressed in it.
  now() { return Date.now() + this.offset }
  static url() {
    const override = new URLSearchParams(location.search).get('server') || localStorage.getItem('aurora-server');
    if (override) return override.replace(/^http/, 'ws');
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  }
  connect() {
    if (this.socket && (this.state === 'open' || this.state === 'connecting')) return Promise.resolve();
    this.state = 'connecting';
    return new Promise((resolve, reject) => {
      let socket;
      try { socket = new WebSocket(Net.url()); } catch (error) { this.state = 'idle'; reject(error); return; }
      this.socket = socket;
      const failed = () => { this.state = 'idle'; reject(new Error('connect failed')); };
      socket.onopen = () => {
        this.state = 'open'; this.bestSample = Infinity;
        this.pinger = setInterval(() => this.ping(), 2500); this.ping();
        this.emit('open', {}); resolve();
      };
      socket.onerror = () => { if (this.state === 'connecting') failed(); };
      socket.onclose = () => {
        clearInterval(this.pinger);
        const wasOpen = this.state === 'open';
        this.state = 'closed'; this.id = 0; this.isHost = false;
        if (wasOpen) this.emit('close', {}); else failed();
      };
      socket.onmessage = event => {
        let message; try { message = JSON.parse(event.data) } catch { return }
        if (message.t === 'pong') {
          const rtt = Date.now() - message.c;
          if (rtt < this.bestSample) { this.bestSample = rtt; this.offset = message.now + rtt / 2 - Date.now(); }
          this.latency = Math.round(rtt / 2);
          return;
        }
        if (message.t === 'joined') { this.id = message.id; this.code = message.code; this.isHost = message.host; this.settings = message.settings; }
        if (message.t === 'players') { this.players = message.players; this.settings = message.settings; this.isHost = message.host === this.id; }
        this.emit(message.t, message);
      };
    });
  }
  ping() { this.send({t: 'ping', c: Date.now()}) }
  send(object) { if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(object)) }
  join(code, profile) { this.send({t: 'join', code: code || '', ...profile}) }
  leave() { this.send({t: 'leave'}); this.id = 0; this.code = ''; this.isHost = false; this.players = []; }
  close() { clearInterval(this.pinger); try { this.socket?.close() } catch {} this.socket = null; this.state = 'idle'; }
}

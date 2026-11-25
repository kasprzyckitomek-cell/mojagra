// Połączenie WebSocket z serwerem gry.
export class Net {
  ws: WebSocket | null = null;
  handlers: ((m: any) => void)[] = [];
  onClose: ((code: number) => void) | null = null;
  bytesIn = 0;
  connect(hello: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      let welcomed = false;
      ws.onopen = () => ws.send(JSON.stringify(hello));
      ws.onmessage = (ev) => {
        this.bytesIn += (ev.data as string).length;
        let m: any;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (!welcomed) {
          if (m.t === 'welcome') { welcomed = true; resolve(m); return; }
          if (m.t === 'err') { reject(m); return; }
        }
        for (const h of this.handlers) h(m);
      };
      ws.onclose = (e) => { if (!welcomed) reject({ text: 'Nie udało się połączyć z serwerem.' }); else this.onClose?.(e.code); };
      ws.onerror = () => { /* obsłużone w onclose */ };
    });
  }
  send(m: any) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }
  on(h: (m: any) => void) {
    this.handlers.push(h);
  }
}

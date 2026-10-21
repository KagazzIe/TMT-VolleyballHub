// Stand-in for the YouTube IFrame API so page checks run offline. Records what the page asks for.
window.__yt = { players: [] };
window.YT = {
  Player: function (id, opts) {
    const el = document.getElementById(id), frame = document.createElement('iframe');
    frame.id = id; el.replaceWith(frame);
    const p = {
      opts, vol: 100, muted: false, state: -1, t: (opts.playerVars && opts.playerVars.start) || 0, rate: 1, destroyed: false,
      setVolume(v) { this.vol = v }, mute() { this.muted = true }, unMute() { this.muted = false },
      playVideo() { this.state = 1 }, pauseVideo() { this.state = 2 }, getPlayerState() { return this.state },
      seekTo(t) { this.t = t }, getCurrentTime() { return this.t }, getDuration() { return 3600 },
      loadVideoById(o) { this.t = (o && o.startSeconds) || 0; this.state = 1 },
      setPlaybackRate(r) { this.rate = r }, getPlaybackRate() { return this.rate },
      q: window.__ytQuality || 'hd1080', getPlaybackQuality() { return this.q }, getAvailableQualityLevels() { return ['hd1080', 'hd720', 'large', 'auto'] },
      destroy() { const d = document.createElement('div'); d.id = id; frame.replaceWith(d); this.destroyed = true }
    };
    window.__yt.players.push(p);
    setTimeout(() => opts.events && opts.events.onReady && opts.events.onReady({ target: p }), 10);
    return p;
  }
};
setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);

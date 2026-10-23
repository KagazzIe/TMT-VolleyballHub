/* TMT: Volleyball Hub: multi-angle video stage, used by Match Clips and Clip Marker.
   A game can have several YouTube videos (angles) of the same match. Everything here works in game time:
   a clock of its own, where each video says when it starts (`at`, in seconds). Video time = game time - at.
   The first video is the game's default angle: it opens focused-for-sound.

   Layout works like a video call: by default the box is split among all angles (a grid). Clicking an angle
   focuses it (big, with the others in a strip below) and switches the sound to it. Fullscreen shows the
   sound angle alone, with YouTube's own control bar.

   Players are never moved in the page (moving an iframe reloads it): each sits in an absolutely placed tile
   that the layout resizes. Quality follows the player's layout size (see AGENTS.md), so the sound angle is
   laid out at 1920x1080 and the others at 1280x720, then scaled to their tiles.

   The sound angle leads: a few times a second the others check their time and seek back in line if they
   drift more than a third of a second. YouTube players can't be frame-locked, so expect 0.1 to 0.3 s. */
(function(){
  const QUALITY=['hd2160','hd1440','hd1080','hd720','large','medium','small','tiny'];
  const GAP=4,DRIFT=0.35;
  let apiWait=null;
  function api(){
    if(window.YT&&YT.Player)return Promise.resolve();
    if(!apiWait)apiWait=new Promise(res=>{
      const prev=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{if(prev)prev();res()};
      const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.appendChild(s);
    });
    return apiWait;
  }
  const css=`
.ang{position:relative;background:#000;border-radius:var(--r);overflow:hidden;touch-action:manipulation}
.ang.ang-fs,.ang.ang-fakefs{border-radius:0;background:#000}
.ang.ang-fakefs{position:fixed;inset:0;z-index:1000;height:100%!important}
.ang-tile{position:absolute;overflow:hidden;background:#000;border-radius:6px}
.ang.single .ang-tile,.ang-fs .ang-tile,.ang-fakefs .ang-tile{border-radius:0}
.ang-frame{position:absolute;inset:0}
.ang-frame iframe{position:absolute;left:0;top:0;transform-origin:0 0;border:0}
.ang-shield{position:absolute;inset:0;cursor:pointer}
.ang-fs .ang-shield,.ang-fakefs .ang-shield{display:none}
.ang-label{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.6);color:#fff;font:600 12px/1 var(--font);padding:4px 7px;border-radius:99px;pointer-events:none;display:flex;gap:4px;align-items:center}
.ang.single .ang-label,.ang-fs .ang-label,.ang-fakefs .ang-label{display:none}
.ang-tile.audio{box-shadow:inset 0 0 0 2px var(--accent,#5b9bff)}
.ang.single .ang-tile.audio,.ang-fs .ang-tile.audio,.ang-fakefs .ang-tile.audio{box-shadow:none}
.ang-off{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:#bbb;font:600 13px var(--font);text-align:center;padding:8px;pointer-events:none}
.ang-tools{position:absolute;top:6px;right:6px;display:flex;gap:6px;z-index:3}
.ang-tools button{background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:99px;font:600 13px var(--font);min-height:32px;min-width:32px;padding:0 10px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.ang-tools button:hover{background:rgba(0,0,0,.8)}
.ang-fs .ang-tools,.ang-fakefs .ang-tools{top:12px;right:12px}
.ang-warm{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;gap:10px;background:#000;color:#fff;font:600 15px var(--font)}
.ang-warm::before{content:'';width:18px;height:18px;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:angspin .8s linear infinite}
@keyframes angspin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.ang-warm::before{animation:none}}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const ICON_FS='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_EXIT='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_GRID='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="currentColor"/></svg>';
  const ICON_SOUND='<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let uid=0;

  // opts: onToggle() when the focused (or only) angle is clicked; onChange() when players, focus or sound change
  function stage(el,opts={}){
    // The stage sets its own height from the layout, so a fixed aspect ratio from the page would fight it
    el.classList.add('ang');el.style.aspectRatio='auto';
    const tools=document.createElement('div');tools.className='ang-tools';el.appendChild(tools);
    const cover=document.createElement('div');cover.className='ang-warm';cover.textContent='Loading HD…';cover.hidden=true;el.appendChild(cover);
    let P=[],audio=null,focus=null,intent=false,lastT=0,rate=1,vol=100,muted=false,fs=false,warm=null;
    const S={};

    const inRange=(p,t)=>{const v=t-p.at;return v>=-0.05&&(!p.dur||v<=p.dur-0.15)};
    const shown=()=>fs?[audio]:P;
    function leader(){
      if(audio&&audio.ready&&inRange(audio,lastT))return audio;
      return P.find(p=>p.ready&&inRange(p,lastT))||audio;
    }
    function atBest(p){
      try{
        const best=p.yt.getAvailableQualityLevels().filter(q=>QUALITY.includes(q))[0],q=QUALITY.indexOf(p.yt.getPlaybackQuality());
        return !!best&&q>=0&&q<=Math.max(QUALITY.indexOf(best),QUALITY.indexOf('hd1080'));
      }catch(e){return false}
    }

    /* ---------- players ---------- */
    function make(p,controls){
      p.ready=false;p.controls=controls;
      const div=document.createElement('div');div.id='ang-p-'+(++uid);
      p.frame.innerHTML='';p.frame.appendChild(div);
      const [w,h]=p.lay||[1920,1080];
      api().then(()=>{
        if(!P.includes(p))return;
        p.yt=new YT.Player(div.id,{videoId:p.id,width:w,height:h,
          playerVars:{controls:controls?1:0,disablekb:controls?0:1,fs:0,rel:0,modestbranding:1,playsinline:1,start:Math.max(0,Math.floor(lastT-p.at))},
          events:{
            onReady:()=>{
              p.ready=true;try{p.dur=p.yt.getDuration()||0}catch(e){}
              applyAudio();try{p.yt.setPlaybackRate(rate)}catch(e){}
              // Joining a warm-up: play the seconds before the clip like the others; otherwise join in line
              if(warm){if(p===audio)warm.t0=performance.now();if(inRange(p,warm.t)){p.yt.seekTo(Math.max(0,warm.t-8-p.at),true);p.yt.playVideo()}}
              else if(inRange(p,lastT)){p.yt.seekTo(Math.max(0,lastT-p.at),true);if(intent)p.yt.playVideo()}
              layout();if(opts.onChange)opts.onChange();
            },
            onStateChange:()=>{if(!p.dur){try{p.dur=p.yt.getDuration()||0}catch(e){}}if(opts.onChange)opts.onChange()}
          }});
      });
    }
    function drop(p){try{p.yt&&p.yt.destroy()}catch(e){}p.tile.remove()}
    // videos: [{id, label, at}]. Players with the same video id are kept, so nudging `at` or reordering doesn't reload.
    S.setVideos=list=>{
      const old=P;P=list.map((v,i)=>{
        let p=old.find(o=>o.id===v.id&&!o.used);
        if(!p){
          p={id:v.id,ready:false};
          p.tile=document.createElement('div');p.tile.className='ang-tile';
          p.tile.innerHTML='<div class="ang-frame"></div><div class="ang-shield"></div><div class="ang-off" hidden>Not recording at this time</div><div class="ang-label"></div>';
          p.frame=p.tile.firstChild;el.insertBefore(p.tile,tools);
          p.tile.querySelector('.ang-shield').onclick=()=>clickTile(p);
        }
        p.used=true;p.at=+v.at||0;p.label=v.label||String.fromCharCode(65+i);
        return p;
      });
      old.filter(o=>!o.used).forEach(drop);P.forEach(p=>delete p.used);
      const newSet=!old.length||!P.some(p=>old.includes(p));
      if(newSet||!P.includes(audio))audio=P[0]||null;
      if(newSet||!P.includes(focus))focus=null;
      if(P.length<2)focus=null;
      layout();P.forEach(p=>{if(!p.yt&&!p.pending){p.pending=true;make(p,false)}});
      applyAudio();if(opts.onChange)opts.onChange();
    };
    S.videos=()=>P.map(p=>({id:p.id,at:p.at,label:p.label}));

    /* ---------- layout ---------- */
    function place(p,x,y,w,h){
      Object.assign(p.tile.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px',display:''});
      // Lay the player out big and scale it down (see AGENTS.md); with YouTube's controls, use the real size
      const lay=p.controls?[Math.round(w),Math.round(h)]:p===audio?[1920,1080]:[1280,720];
      p.lay=lay;const f=p.frame.querySelector('iframe');
      if(f){f.style.width=lay[0]+'px';f.style.height=lay[1]+'px';f.style.transform=p.controls?'none':`scale(${w/lay[0]})`;
        const fh=lay[1]*(p.controls?1:w/lay[0]);f.style.top=Math.max(0,(h-fh)/2)+'px'}
    }
    let laidW=0;
    function layout(){
      const W=laidW=fs?el.clientWidth:el.clientWidth||el.parentNode.clientWidth;
      el.classList.toggle('single',P.length<2||fs);
      if(!P.length){el.style.height=W*9/16+'px';return}
      P.forEach(p=>{p.tile.style.display='none'});
      if(fs){
        const H=el.clientHeight||innerHeight,w=Math.min(W,H*16/9),h=w*9/16;
        place(audio,(W-w)/2,(H-h)/2,w,h);
      }else if(P.length===1){
        el.style.height=W*9/16+'px';place(P[0],0,0,W,W*9/16);
      }else if(focus){
        // Speaker view: the focused angle big, the others in a strip under it
        const others=P.filter(p=>p!==focus),bigH=W*9/16,tw=Math.min((W-GAP*(others.length-1))/others.length,W/4),th=tw*9/16;
        place(focus,0,0,W,bigH);
        const x0=(W-(tw*others.length+GAP*(others.length-1)))/2;
        others.forEach((p,i)=>place(p,x0+i*(tw+GAP),bigH+GAP,tw,th));
        el.style.height=bigH+GAP+th+'px';
      }else{
        // Grid: split evenly; one column on narrow screens
        const n=P.length,cols=W<560?1:n<=4?2:3,rows=Math.ceil(n/cols),tw=(W-GAP*(cols-1))/cols,th=tw*9/16;
        P.forEach((p,i)=>{
          const r=Math.floor(i/cols),inRow=r===rows-1?n-r*cols:cols,x0=(W-(tw*inRow+GAP*(inRow-1)))/2;
          place(p,x0+(i-r*cols)*(tw+GAP),r*(th+GAP),tw,th);
        });
        el.style.height=rows*th+GAP*(rows-1)+'px';
      }
      P.forEach(p=>{
        p.tile.classList.toggle('audio',p===audio);
        p.tile.querySelector('.ang-label').innerHTML=esc(p.label)+(p===audio?ICON_SOUND:'');
      });
      tools.innerHTML=(focus&&!fs?`<button data-a="grid" title="Show all angles">${ICON_GRID} All angles</button>`:'')+
        `<button data-a="fs" aria-label="${fs?'Exit full screen':'Full screen'}" title="${fs?'Exit full screen (Esc)':'Full screen (F)'}">${fs?ICON_EXIT:ICON_FS}</button>`;
      tools.style.display=P.length?'':'none';
    }
    tools.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;b.blur();if(b.dataset.a==='grid')S.focus(null);else S.fullscreen()});
    try{new ResizeObserver(()=>layout()).observe(el.parentNode)}catch(e){addEventListener('resize',layout)}
    function clickTile(p){
      if(P.length>1&&p!==focus){S.focus(p)}
      else if(opts.onToggle)opts.onToggle();
    }
    // Focus an angle (or null for the grid). The focused angle also gets the sound.
    S.focus=p=>{
      if(typeof p==='number')p=P[p];
      focus=p&&P.length>1?p:null;
      if(p&&p!==audio)S.setAudio(p);else{layout();if(opts.onChange)opts.onChange()}
    };
    S.setAudio=p=>{
      if(typeof p==='number')p=P[p];if(!p)return;
      const was=audio;audio=p;
      // The sound angle leads; bring it in line with the old leader first
      if(was&&was!==p&&was.ready&&p.ready&&inRange(p,lastT))p.yt.seekTo(Math.max(0,lastT-p.at),true);
      applyAudio();layout();if(opts.onChange)opts.onChange();
    };
    S.audioIndex=()=>P.indexOf(audio);
    S.focusIndex=()=>P.indexOf(focus);

    /* ---------- fullscreen: the sound angle alone, with YouTube's control bar ---------- */
    S.fullscreen=on=>{
      if(on===undefined)on=!fs;if(on===fs||!audio)return;
      if(on){
        fs=true;
        if(el.requestFullscreen)el.requestFullscreen().catch(()=>el.classList.add('ang-fakefs'));else el.classList.add('ang-fakefs');
        el.classList.add('ang-fs');
      }else{
        fs=false;el.classList.remove('ang-fs','ang-fakefs');
        if(document.fullscreenElement===el)document.exitFullscreen().catch(()=>{});
      }
      lastT=S.time();
      // YouTube's controls can only be set when a player is made, so remake the sound angle's player
      try{audio.yt&&audio.yt.destroy()}catch(e){}
      const a=audio;a.yt=null;a.ready=false;a.controls=fs;
      setTimeout(()=>{layout();make(a,fs)},60);
      layout();if(opts.onChange)opts.onChange();
    };
    S.isFullscreen=()=>fs;
    document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&fs)S.fullscreen(false);else layout()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&fs&&el.classList.contains('ang-fakefs'))S.fullscreen(false)});

    /* ---------- playback, in game time ---------- */
    S.time=()=>{
      if(warm)return warm.t;
      const L=leader();
      if(L&&L.ready&&L.yt)try{return L.yt.getCurrentTime()+L.at}catch(e){}
      return lastT;
    };
    S.playing=()=>intent;
    S.busy=()=>!!warm;
    S.ready=()=>!!audio&&audio.ready;
    // The span of game time any video covers (durations are known once players load)
    S.range=()=>{
      if(!P.length)return[0,0];
      return[Math.min(...P.map(p=>p.at)),Math.max(...P.map(p=>p.at+(p.dur||0)))];
    };
    S.seek=t=>{
      lastT=t;
      P.forEach(p=>{if(!p.ready)return;if(inRange(p,t))p.yt.seekTo(Math.max(0,t-p.at),true);else p.yt.pauseVideo()});
    };
    S.play=()=>{intent=true;const t=lastT=S.time();P.forEach(p=>{if(p.ready&&inRange(p,t))p.yt.playVideo()});if(opts.onChange)opts.onChange()};
    S.pause=()=>{intent=false;lastT=S.time();P.forEach(p=>{if(p.ready)p.yt.pauseVideo()});if(opts.onChange)opts.onChange()};
    // Start playing at game time t. With warm, angles that haven't reached HD yet first play the few seconds
    // before t muted and covered, until the sound angle reaches its best quality (6 seconds at most).
    S.start=(t,{warm:doWarm}={})=>{
      lastT=t;intent=true;
      // Already at best quality (say, YouTube remembers a fast connection): no need to warm up
      if(doWarm&&audio&&audio.ready&&atBest(audio))P.forEach(p=>{if(p.ready)p.warmed=true});
      const cold=doWarm&&P.some(p=>inRange(p,t)&&!p.warmed);
      if(cold){
        warm={t,t0:performance.now()};cover.hidden=false;applyAudio();
        P.forEach(p=>{if(p.ready&&inRange(p,t)){p.yt.seekTo(Math.max(0,t-8-p.at),true);p.yt.playVideo()}});
      }else{S.seek(t);S.play()}
      if(opts.onChange)opts.onChange();
    };
    function endWarm(){
      const t=warm.t;warm=null;cover.hidden=true;P.forEach(p=>{if(inRange(p,t))p.warmed=true});
      applyAudio();S.seek(t);S.play();
    }
    S.setRate=r=>{rate=r;P.forEach(p=>{if(p.ready)try{p.yt.setPlaybackRate(r)}catch(e){}})};
    S.setVolume=(v,m)=>{vol=v;muted=m;applyAudio()};
    function applyAudio(){
      P.forEach(p=>{
        if(!p.ready)return;
        try{p.yt.setVolume(vol);(p===audio&&!muted&&vol&&!warm)?p.yt.unMute():p.yt.mute()}catch(e){}
      });
    }

    // Keep the angles in line with the leader
    setInterval(()=>{
      if(!P.length)return;
      if(el.clientWidth!==laidW)layout();   // in case a resize was missed
      if(warm){
        const L=audio&&audio.ready?audio:P.find(p=>p.ready);
        if(L&&(atBest(L)||performance.now()-warm.t0>6000||L.yt.getCurrentTime()+L.at>=warm.t-0.3))endWarm();
        return;
      }
      const L=leader();if(!L||!L.ready||!L.yt)return;
      let t;try{t=L.yt.getCurrentTime()+L.at}catch(e){return}
      lastT=t;
      P.forEach(p=>{
        const off=!inRange(p,t);p.tile.querySelector('.ang-off').hidden=!off||!p.ready;
        if(p===L||!p.ready||!p.yt)return;
        let s,have;try{s=p.yt.getPlayerState();have=p.yt.getCurrentTime()}catch(e){return}
        if(off){if(s===1)p.yt.pauseVideo();return}
        const want=t-p.at;
        if(intent&&s!==1&&s!==3)p.yt.playVideo();
        if(!intent&&s===1)p.yt.pauseVideo();
        if(Math.abs(have-want)>(s===3?2.5:DRIFT))p.yt.seekTo(want,true);
      });
    },250);
    S.players=()=>P;
    layout();
    return S;
  }
  window.TMTAngles={stage};
})();

(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const DB_NAME = "photovault-local-v1", STORE = "media", META = "meta";
  let db, items = [], filter = "all", query = "", selectionMode = false, selected = new Set();
  let sortNewest = true, currentId = null, currentObjectUrl = null, rotated = 0, pattern = [], patternMode = "setup", toastTimer;
  const objectUrls = new Map();

  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const d = request.result;
        const store = d.createObjectStore(STORE, {keyPath:"id"});
        store.createIndex("createdAt", "createdAt");
        d.createObjectStore(META, {keyPath:"key"});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function tx(store, mode="readonly") { return db.transaction(store, mode).objectStore(store); }
  function getAll() { return new Promise((resolve,reject)=>{const r=tx(STORE).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
  function saveItem(item) { return new Promise((resolve,reject)=>{const r=tx(STORE,"readwrite").put(item);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}); }
  function deleteItem(id) { return new Promise((resolve,reject)=>{const r=tx(STORE,"readwrite").delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}); }
  function getMeta(key) { return new Promise(resolve=>{const r=tx(META).get(key);r.onsuccess=()=>resolve(r.result?.value);r.onerror=()=>resolve(null);}); }
  function setMeta(key,value) { return new Promise((resolve,reject)=>{const r=tx(META,"readwrite").put({key,value});r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}); }
  function urlFor(item) {
    if (!objectUrls.has(item.id)) objectUrls.set(item.id, URL.createObjectURL(item.blob));
    return objectUrls.get(item.id);
  }
  function revokeUrl(id) { const u=objectUrls.get(id);if(u){URL.revokeObjectURL(u);objectUrls.delete(id);} }
  function escapeHTML(s="") { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function formatDate(t) { return new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"numeric"}).format(new Date(t)); }
  function formatSize(n) { if(n<1024*1024)return `${Math.max(1,Math.round(n/1024))} KB`;return `${(n/1024/1024).toFixed(1)} MB`; }
  function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  async function importFiles(fileList) {
    const files = [...fileList].filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!files.length) { toast("Choose image or video files to import."); return; }
    toast(`Importing ${files.length} item${files.length===1?"":"s"}…`);
    let added=0, failed=0;
    for (const file of files) {
      try {
        const item = {id:makeId(),name:file.name || `Media ${Date.now()}`,type:file.type.startsWith("video/")?"video":"image",mime:file.type || "application/octet-stream",size:file.size,createdAt:file.lastModified || Date.now(),importedAt:Date.now(),favorite:false,rotation:0,blob:file,album:"Library",duration:null,thumbnail:null};
        if (item.type==="video") {
          const thumb = await createVideoThumbnail(file);
          if (thumb) item.thumbnail=thumb;
          item.duration = await readVideoDuration(file);
        } else {
          item.thumbnail = await createImageThumbnail(file);
        }
        await saveItem(item); added++;
      } catch(e) { console.warn("Import failed", file.name, e); failed++; }
    }
    await refresh();
    toast(failed ? `Imported ${added}; ${failed} could not be imported.` : `Imported ${added} item${added===1?"":"s"}.`);
    $("filePicker").value="";
  }
  function createImageThumbnail(file) {
    return new Promise(resolve=>{
      const img=new Image(), url=URL.createObjectURL(file);
      img.onload=()=>{try{const c=document.createElement("canvas"),max=480,scale=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{URL.revokeObjectURL(url);resolve(b);},"image/jpeg",.78);}catch{URL.revokeObjectURL(url);resolve(null);}};
      img.onerror=()=>{URL.revokeObjectURL(url);resolve(null)};img.src=url;
    });
  }
  function createVideoThumbnail(file) {
    return new Promise(resolve=>{
      const v=document.createElement("video"),url=URL.createObjectURL(file);let done=false;
      const finish=b=>{if(done)return;done=true;URL.revokeObjectURL(url);v.removeAttribute("src");v.load();resolve(b||null)};
      v.muted=true;v.playsInline=true;v.preload="metadata";
      v.onloadedmetadata=()=>{try{v.currentTime=Math.min(0.5,Math.max(0,(v.duration||1)*.05));}catch{finish(null)}};
      v.onseeked=()=>{try{const c=document.createElement("canvas"),max=480,scale=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));c.width=Math.max(1,Math.round(v.videoWidth*scale));c.height=Math.max(1,Math.round(v.videoHeight*scale));c.getContext("2d").drawImage(v,0,0,c.width,c.height);c.toBlob(b=>finish(b),"image/jpeg",.76);}catch{finish(null)}};
      v.onerror=()=>finish(null);v.src=url;setTimeout(()=>finish(null),6000);
    });
  }
  function readVideoDuration(file) {
    return new Promise(resolve=>{const v=document.createElement("video"),u=URL.createObjectURL(file);v.preload="metadata";v.onloadedmetadata=()=>{const d=v.duration;URL.revokeObjectURL(u);resolve(Number.isFinite(d)?d:null)};v.onerror=()=>{URL.revokeObjectURL(u);resolve(null)};setTimeout(()=>{URL.revokeObjectURL(u);resolve(null)},5000);});
  }
  function durationLabel(d) { if(!Number.isFinite(d))return "VIDEO";const m=Math.floor(d/60),s=Math.floor(d%60);return `${m}:${String(s).padStart(2,"0")}`; }
  function visibleItems() {
    let arr=[...items];
    if(filter==="photos")arr=arr.filter(i=>i.type==="image");
    if(filter==="videos")arr=arr.filter(i=>i.type==="video");
    if(filter==="favorites")arr=arr.filter(i=>i.favorite);
    if(query){const q=query.toLowerCase();arr=arr.filter(i=>i.name.toLowerCase().includes(q)||(i.album||"").toLowerCase().includes(q)||formatDate(i.createdAt).toLowerCase().includes(q));}
    arr.sort((a,b)=>sortNewest?b.createdAt-a.createdAt:a.createdAt-b.createdAt);
    return arr;
  }
  function renderCounts() {
    $("allCount").textContent=items.length;
    $("photoCount").textContent=items.filter(i=>i.type==="image").length;
    $("videoCount").textContent=items.filter(i=>i.type==="video").length;
    $("favoriteCount").textContent=items.filter(i=>i.favorite).length;
  }
  function renderGrid() {
    const grid=$("mediaGrid"), arr=visibleItems();grid.innerHTML="";
    arr.forEach((item,index)=>{
      const card=document.createElement("button");card.className="media-card"+(selected.has(item.id)?" selected":"");card.type="button";card.style.animationDelay=`${Math.min(index,15)*18}ms`;card.setAttribute("aria-label",`${item.type==="video"?"Video":"Photo"}: ${item.name}`);
      const thumb=item.thumbnail;
      if(thumb){const img=document.createElement("img");img.alt="";img.loading="lazy";img.src=URL.createObjectURL(thumb);img.addEventListener("load",()=>URL.revokeObjectURL(img.src),{once:true});card.append(img);}
      else if(item.type==="image"){const img=document.createElement("img");img.alt="";img.loading="lazy";img.src=urlFor(item);card.append(img);}
      else {const ph=document.createElement("div");ph.className="thumb-placeholder";ph.textContent="▶";card.append(ph);}
      if(item.favorite){const f=document.createElement("span");f.className="favorite-mark";f.textContent="♥";card.append(f);}
      if(item.type==="video"){const b=document.createElement("span");b.className="video-badge";b.textContent=durationLabel(item.duration);card.append(b);const p=document.createElement("span");p.className="media-type";p.textContent="▶";card.append(p);}
      if(selectionMode){const mark=document.createElement("span");mark.className="select-mark";mark.textContent=selected.has(item.id)?"✓":"";card.append(mark);}
      card.addEventListener("click",()=>selectionMode?toggleSelection(item.id):openViewer(item.id));grid.append(card);
    });
    $("emptyState").classList.toggle("hidden",arr.length>0);
    $("mediaGrid").classList.toggle("hidden",arr.length===0);
    $("selectionBar").classList.toggle("hidden",!selectionMode);
    $("selectedCount").textContent=`${selected.size} selected`;
    $("sectionTitle").textContent=({all:"Recent media",photos:"Photos",videos:"Videos",favorites:"Favorites"})[filter];
    $("sectionSubtitle").textContent=`${arr.length} item${arr.length===1?"":"s"} · Stored on this device`;
    $("selectMode").textContent=selectionMode?"Done":"Select";
    $("sortButton").textContent=sortNewest?"Newest ↓":"Oldest ↑";
    renderCounts();
  }
  async function refresh(){items=await getAll();renderGrid();$("storageStatus").textContent=`${items.length} item${items.length===1?"":"s"} stored in this browser on this iPhone.`;}
  function toggleSelection(id){selected.has(id)?selected.delete(id):selected.add(id);renderGrid();}
  function setSelectionMode(on){selectionMode=on;if(!on)selected.clear();renderGrid();}
  async function deleteIds(ids) {
    if(!ids.length)return;
    if(!confirm(`Delete ${ids.length} item${ids.length===1?"":"s"} from PhotoVault? This will not delete the original in Apple Photos.`))return;
    for(const id of ids){await deleteItem(id);revokeUrl(id);}
    if(currentId&&ids.includes(currentId))closeViewer();
    selected.clear();selectionMode=false;await refresh();toast("Deleted from PhotoVault.");
  }
  function openViewer(id) {
    const item=items.find(i=>i.id===id);if(!item)return;
    currentId=id;rotated=item.rotation||0;
    const stage=$("viewerStage");stage.innerHTML="";
    if(item.type==="video"){const v=document.createElement("video");v.controls=true;v.playsInline=true;v.preload="metadata";v.src=urlFor(item);stage.append(v);}
    else {const img=document.createElement("img");img.src=urlFor(item);img.alt=item.name;img.style.transform=`rotate(${rotated}deg)`;img.draggable=false;stage.append(img);}
    $("viewerName").textContent=item.name;$("viewerMeta").textContent=`${formatDate(item.createdAt)} · ${formatSize(item.size)}`;
    $("viewerCounter").textContent=`${items.findIndex(i=>i.id===id)+1} / ${items.length}`;
    $("viewerFavorite").textContent=item.favorite?"♥":"♡";$("viewerFavorite").style.color=item.favorite?"#ff91b0":"white";
    $("rotateMedia").style.display=item.type==="image"?"grid":"none";
    $("viewer").classList.remove("hidden");
  }
  function closeViewer(){const stage=$("viewerStage");stage.querySelectorAll("video").forEach(v=>{v.pause();v.removeAttribute("src");v.load();});stage.innerHTML="";$("viewer").classList.add("hidden");currentId=null;}
  async function toggleFavorite(){const item=items.find(i=>i.id===currentId);if(!item)return;item.favorite=!item.favorite;await saveItem(item);await refresh();$("viewerFavorite").textContent=item.favorite?"♥":"♡";$("viewerFavorite").style.color=item.favorite?"#ff91b0":"white";toast(item.favorite?"Added to favorites":"Removed from favorites");}
  async function rotateCurrent(){const item=items.find(i=>i.id===currentId);if(!item||item.type!=="image")return;item.rotation=((item.rotation||0)+90)%360;await saveItem(item);rotated=item.rotation;const img=$("viewerStage").querySelector("img");if(img)img.style.transform=`rotate(${rotated}deg)`;toast("Rotation saved for viewing.");}
  function downloadCurrent(){const item=items.find(i=>i.id===currentId);if(!item)return;const a=document.createElement("a");a.href=urlFor(item);a.download=item.name||"photovault-media";document.body.append(a);a.click();a.remove();toast("Export started. Check Files or Downloads.");}
  async function initPattern() {
    const saved=await getMeta("patternHash");
    $("lockScreen").classList.remove("hidden");$("mainContent").classList.add("hidden");
    patternMode=saved?"unlock":"setup";
    $("lockTitle").textContent=saved?"Unlock PhotoVault":"Set your pattern";
    $("lockHint").textContent=saved?"Draw your pattern to open your private gallery.":"Connect at least 4 dots. Your pattern is stored on this device.";
    $("submitPattern").textContent=saved?"Unlock":"Continue";
    $("resetPattern").classList.toggle("hidden",!saved);
    buildPatternGrid();
  }
  function buildPatternGrid(){
    const grid=$("patternGrid");grid.innerHTML="";
    for(let i=0;i<9;i++){const d=document.createElement("div");d.className="pattern-dot";d.dataset.index=i;grid.append(d);}
    const pointFromEvent=e=>{const el=document.elementFromPoint(e.clientX,e.clientY)?.closest(".pattern-dot");if(el&&grid.contains(el)){const n=Number(el.dataset.index);if(!pattern.includes(n)){pattern.push(n);el.classList.add("active");el.textContent="•";}}};
    let drawing=false;
    grid.onpointerdown=e=>{e.preventDefault();pattern=[];grid.querySelectorAll(".pattern-dot").forEach(d=>{d.classList.remove("active");d.textContent="";});drawing=true;grid.setPointerCapture?.(e.pointerId);pointFromEvent(e);};
    grid.onpointermove=e=>{if(drawing){e.preventDefault();pointFromEvent(e);}};
    const end=e=>{if(!drawing)return;drawing=false;$("patternMessage").textContent=pattern.length<4?"Use at least 4 dots.":"Pattern ready. Tap Continue.";};
    grid.onpointerup=end;grid.onpointercancel=end;
  }
  async function digestPattern(p){const bytes=new TextEncoder().encode("PhotoVault-pattern-v1:"+p.join("-"));const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  async function submitPattern(){
    if(pattern.length<4){$("patternMessage").textContent="Use at least 4 dots.";return;}
    const value=await digestPattern(pattern);
    if(patternMode==="setup"){window._firstPattern=value;patternMode="confirm";pattern=[];$("lockTitle").textContent="Confirm your pattern";$("lockHint").textContent="Draw the same pattern again to finish setup.";$("submitPattern").textContent="Confirm";$("patternMessage").textContent="";buildPatternGrid();return;}
    if(patternMode==="confirm"){
      if(window._firstPattern===value){await setMeta("patternHash",value);window._firstPattern=null;unlockUI();return;}
      window._firstPattern=null;pattern=[];buildPatternGrid();$("patternMessage").textContent="Patterns did not match. Start again.";patternMode="setup";$("lockTitle").textContent="Set your pattern";$("lockHint").textContent="Connect at least 4 dots. Your pattern is stored on this device.";$("submitPattern").textContent="Continue";return;
    }
    const saved=await getMeta("patternHash");
    if(value===saved){unlockUI();}else{$("patternMessage").textContent="That pattern did not match. Try again.";pattern=[];buildPatternGrid();}
  }
  function unlockUI(){$("lockScreen").classList.add("hidden");$("mainContent").classList.remove("hidden");pattern=[];$("patternMessage").textContent="";}
  async function resetPattern(){if(!confirm("Reset the pattern lock? You will need to set a new one."))return;await setMeta("patternHash",null);await setMeta("pendingPatternHash",null);window._firstPattern=null;patternMode="setup";$("lockTitle").textContent="Set your pattern";$("lockHint").textContent="Connect at least 4 dots. Your pattern is stored on this device.";$("submitPattern").textContent="Continue";$("resetPattern").classList.add("hidden");pattern=[];buildPatternGrid();$("patternMessage").textContent="Draw a new pattern.";}
  function showAlbums(){const names=[...new Set(items.map(i=>i.album||"Library"))];const answer=prompt("Albums on this device:\n"+names.map((n,i)=>`${i+1}. ${n}`).join("\n")+"\n\nType a new album name to create it:");if(!answer||!answer.trim())return;const name=answer.trim().slice(0,40);if(names.includes(name)){toast("That album already exists.");return;}$("albumName").value=name;$("albumModal").classList.remove("hidden");}
  async function createAlbum(){const name=$("albumName").value.trim();if(!name){$("albumMessage").textContent="Enter an album name.";return;}const chosen=[...selected];if(chosen.length){for(const id of chosen){const item=items.find(i=>i.id===id);if(item){item.album=name;await saveItem(item);}}setSelectionMode(false);toast(`Moved ${chosen.length} item(s) to ${name}.`);}else{toast(`Album “${name}” created. Select media and create it again to add items.`);} $("albumModal").classList.add("hidden");$("albumName").value="";await refresh();}
  function bindEvents(){
    $("addButton").onclick=$("emptyImport").onclick=()=>$("filePicker").click();
    $("filePicker").addEventListener("change",e=>importFiles(e.target.files));
    $("searchInput").addEventListener("input",e=>{query=e.target.value.trim();$("clearSearch").style.visibility=query?"visible":"hidden";renderGrid();});
    $("clearSearch").onclick=()=>{$("searchInput").value="";query="";$("clearSearch").style.visibility="hidden";renderGrid();};
    document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));renderGrid();}));
    $("selectMode").onclick=()=>setSelectionMode(!selectionMode);
    $("cancelSelection").onclick=()=>setSelectionMode(false);
    $("deleteSelected").onclick=()=>deleteIds([...selected]);
    $("sortButton").onclick=()=>{sortNewest=!sortNewest;renderGrid();};
    $("closeViewer").onclick=closeViewer;$("viewerFavorite").onclick=toggleFavorite;$("rotateMedia").onclick=rotateCurrent;$("downloadMedia").onclick=downloadCurrent;
    $("deleteCurrent").onclick=()=>currentId&&deleteIds([currentId]);
    $("lockNow").onclick=()=>{closeViewer();$("mainContent").classList.add("hidden");$("lockScreen").classList.remove("hidden");patternMode="unlock";pattern=[];buildPatternGrid();$("patternMessage").textContent="Draw your pattern to unlock.";};
    $("submitPattern").onclick=submitPattern;$("resetPattern").onclick=resetPattern;
    $("closeAlbumModal").onclick=()=>$("albumModal").classList.add("hidden");$("createAlbum").onclick=createAlbum;
    $("clearSearch").style.visibility="hidden";
    $("sectionTitle").addEventListener("dblclick",showAlbums);
  }
  async function boot(){
    bindEvents();
    try{db=await openDB();await refresh();await initPattern();}
    catch(e){console.error(e);toast("Local storage is unavailable. Try reopening in Safari over HTTPS.");$("storageStatus").textContent="Browser storage could not be opened.";}
    if("storage" in navigator && navigator.storage?.persist){navigator.storage.persist().then(ok=>{if(!ok)console.info("Persistent storage was not granted.");}).catch(()=>{});}
  }
  document.addEventListener("visibilitychange",()=>{if(document.hidden && !$("lockScreen").classList.contains("hidden"))return;});
  window.addEventListener("beforeunload",()=>{for(const u of objectUrls.values())URL.revokeObjectURL(u);});
  boot();
})();
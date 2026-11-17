'use strict';
const PREFIX='molly-midnight-map-'+self.registration.scope;
const CACHE=PREFIX+'v1.3.1-android-audio-range';
const FILES=['./','index.html','styles.css','app.js','story-data.js','story.txt','manifest.webmanifest','assets/cover.webp','assets/map.webp','assets/paperbridge.webp','assets/observatory.webp','assets/repair.webp','assets/door.webp','assets/icon-192.png','assets/icon-512.png','audio/page-01.mp3','audio/page-02.mp3','audio/page-03.mp3','audio/page-04.mp3','audio/page-05.mp3','audio/page-06.mp3','audio/page-07.mp3','audio/page-08.mp3','audio/page-09.mp3'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);await self.clients.claim();for(const client of await self.clients.matchAll())client.postMessage({type:'BOOK_CACHED'});})()));
self.addEventListener('message',event=>{if(event.data?.type==='CACHE_STATUS')event.waitUntil((async()=>{const cache=await caches.open(CACHE);const checks=await Promise.all(FILES.map(file=>cache.match(new URL(file,self.registration.scope).href)));if(checks.every(Boolean))event.source?.postMessage({type:'BOOK_CACHED'});})());});
// Android media playback often requests only part of an MP3 (Range: bytes=...).
// Serve valid 206 Partial Content responses from the offline cache instead of
// returning a full 200 response to a range request.
async function audioRangeResponse(fullResponse, rangeHeader) {
  const bytes = await fullResponse.arrayBuffer();
  const length = bytes.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    return new Response(null, {status:416, headers:{'Content-Range':`bytes */${length}`}});
  }
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix<=0) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${length}`}});
    start = Math.max(0,length-suffix);end=length-1;
  } else {
    start=Number(match[1]);end=match[2]?Number(match[2]):length-1;
  }
  if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=length||end<start) {
    return new Response(null,{status:416,headers:{'Content-Range':`bytes */${length}`}});
  }
  end=Math.min(end,length-1);
  const headers=new Headers();
  headers.set('Content-Type',fullResponse.headers.get('Content-Type')||'audio/mpeg');
  headers.set('Accept-Ranges','bytes');
  headers.set('Content-Range',`bytes ${start}-${end}/${length}`);
  headers.set('Content-Length',String(end-start+1));
  return new Response(bytes.slice(start,end+1),{status:206,statusText:'Partial Content',headers});
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||!request.url.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const isAudio=/\/audio\/page-\d{2}\.mp3$/.test(new URL(request.url).pathname);
    const range=isAudio?request.headers.get('Range'):null;
    const cached=await cache.match(request.url,{ignoreSearch:true});
    if(cached){
      if(range)return audioRangeResponse(cached,range);
      return cached;
    }
    try{
      // For uncached audio, obtain the entire file once so later range requests
      // and offline playback can be served consistently.
      const networkRequest=(isAudio&&range)?new Request(request.url,{cache:'no-store'}):request;
      const response=await fetch(networkRequest);
      if(isAudio&&response.ok&&response.status===200){
        await cache.put(request.url,response.clone());
        if(range)return audioRangeResponse(response,range);
      }
      return response;
    }catch(error){
      if(request.mode==='navigate')return await cache.match('index.html');
      throw error;
    }
  })());
});

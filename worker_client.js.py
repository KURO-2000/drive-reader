/* Kuro Reader Cloudflare Worker client, browser non-module.
   Never include GOOGLE_REFRESH_TOKEN, PAIRING_KEY, or OAuth secret in this file.
   Use: const api = new KuroWorkerClient('https://...workers.dev');
   await api.pair(code, 'my PC'); await api.files();
*/
(function () {
  'use strict';
  class KuroWorkerClient {
    constructor(baseURL) {
      this.baseURL = String(baseURL || '').trim().replace(/\/+$/, '');
      if (!/^https:\/\/[^/]+(?:\/.*)?$/i.test(this.baseURL)) throw new Error('https://...workers.dev 형태의 서버 주소를 입력하세요.');
      this.storageKey = 'kuroWorkerDeviceToken:' + this.baseURL;
      this.token = '';
      try { this.token = localStorage.getItem(this.storageKey) || ''; } catch (_) {}
    }
    async call(path, {method='GET', body, headers={}, isRaw=false, allow308=false}={}) {
      const h = new Headers(headers);
      if (this.token) h.set('Authorization', 'Bearer ' + this.token);
      if (body && !(body instanceof Blob) && typeof body !== 'string') {
        h.set('Content-Type', 'application/json');
        body = JSON.stringify(body);
      }
      let r;
      try { r = await fetch(this.baseURL + path, {method,headers:h,body,cache:'no-store'}); }
      catch(e) { throw new Error('서버 연결 실패: ' + e.message + ' (HTTPS/CORS/주소 확인)'); }
      if (!r.ok && !(allow308 && r.status === 308)) {
        let detail = `HTTP ${r.status}`;
        try {
          const type = r.headers.get('Content-Type') || '';
          if (type.includes('json')) { const j=await r.json(); detail=j.error || j.message || detail; }
          else detail = (await r.text()).slice(0,250) || detail;
        } catch (_) {}
        if (r.status === 401) detail += ' — 연결 코드로 다시 기기 등록이 필요합니다.';
        throw new Error(detail);
      }
      return isRaw ? r : r.status === 204 ? null : r.json();
    }
    async pair(key,label='My browser') {
      const data=await this.call('/api/pair',{method:'POST',body:{key,label}});
      if (!/^[a-f0-9]{64}$/.test(data.token || '')) throw new Error('서버 토큰 형식이 올바르지 않습니다.');
      this.token=data.token;
      try { localStorage.setItem(this.storageKey,this.token); } catch(_) {}
      return data;
    }
    forget() {this.token='';try {localStorage.removeItem(this.storageKey);} catch(_) {}}
    status() {return this.call('/api/status');}
    files(parentId='',pageToken='') {
      const q=new URLSearchParams();
      if (parentId) q.set('parent',parentId);
      if (pageToken) q.set('pageToken',pageToken);
      const args=q.toString();
      return this.call('/api/files'+(args?'?'+args:''));
    }
    download(fileId,range='') {
      const headers=range?{'Range':range}:{};
      return this.call('/api/files/'+encodeURIComponent(fileId)+'/content',{headers,isRaw:true});
    }
    makeFolder(name,parentId='') {
      return this.call('/api/folders',{method:'POST',body:{name,...(parentId?{parentId}:{})}});
    }
    rename(fileId,name) {
      return this.call('/api/files/'+encodeURIComponent(fileId),{method:'PATCH',body:{name}});
    }
    move(fileId,parentId) {
      return this.call('/api/files/'+encodeURIComponent(fileId),{method:'PATCH',body:{parentId}});
    }
    trash(fileId) {
      return this.call('/api/files/'+encodeURIComponent(fileId),{method:'DELETE'});
    }
    getProgress(fileId) {
      return this.call('/api/progress/'+encodeURIComponent(fileId));
    }
    saveProgress(fileId,device,position) {
      if (!['web','app'].includes(device)) throw new Error('device는 web 또는 app입니다.');
      return this.call('/api/progress/'+encodeURIComponent(fileId)+'/'+device,{method:'PUT',body:position});
    }
    async upload(file, parentId='', onProgress=null) {
      if (!file || !Number.isSafeInteger(file.size)) throw new Error('올바른 파일을 선택하세요.');
      const begin=await this.call('/api/uploads',{method:'POST',body:{name:file.name,size:file.size,mimeType:file.type||'application/octet-stream',...(parentId?{parentId}:{})}});
      const id=encodeURIComponent(begin.uploadId);
      // Google resumable uploads require non-final chunks in 256KiB multiples.
      const chunkSize=8*1024*1024;
      let pos=0;
      while (pos<file.size) {
        const end=Math.min(file.size,pos+chunkSize);
        const chunk=file.slice(pos,end);
        const headers={'Content-Range':`bytes ${pos}-${end-1}/${file.size}`,'Content-Type':file.type||'application/octet-stream'};
        const res=await this.call('/api/uploads/'+id,{method:'PUT',body:chunk,headers,isRaw:true,allow308:true});
        if (res.status===308) {
          const range=res.headers.get('Range')||'';
          const match=/bytes=0-(\d+)/.exec(range);
          const acknowledged=match?Number(match[1])+1:end;
          if (!Number.isSafeInteger(acknowledged)||acknowledged<=pos) throw new Error('업로드 응답 범위 오류: '+range);
          pos=acknowledged;
        } else if (res.status===200||res.status===201) {
          pos=file.size;
          if (onProgress)onProgress(pos,file.size);
          return res.json();
        } else throw new Error('업로드 중 예상치 못한 응답: '+res.status);
        if (onProgress)onProgress(pos,file.size);
      }
      throw new Error('빈 파일은 이 시험 페이지에서 지원하지 않습니다.');
    }
  }
  window.KuroWorkerClient=KuroWorkerClient;
})();

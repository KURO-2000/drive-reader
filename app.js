/* =========================================================
   GOOGLE 설정
========================================================= */

const GOOGLE_CLIENT_ID =
  "380675432822-gkd6ss2s1aj6ca4k9lkv7l4v7vebgb4g.apps.googleusercontent.com";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata"
].join(" ");

const LIBRARY_FOLDER_NAME =
  "Novel Reader Library";

const STATE_FILE_NAME =
  "reader-state.json";

const GOOGLE_CONNECTED_KEY =
  "driveReaderGoogleConnected";

const GOOGLE_ACCESS_TOKEN_KEY =
  "driveReaderGoogleAccessToken";

const GOOGLE_ACCESS_TOKEN_EXPIRES_KEY =
  "driveReaderGoogleAccessTokenExpires";


/* =========================================================
   상태
========================================================= */

let tokenClient = null;
let accessToken = "";

let libraryFolderId = "";
let stateFileId = "";

let books = [];
let folders = [];
let currentFolderId = "";
let folderPath = [];

let selectedBook = null;

let txtChapters = [];
let currentTxtChapter = 0;

let epubBook = null;
let epubRendition = null;
let epubObjectUrl = null;

let scrollSaveTimer = null;
let stateSaveTimer = null;

const AUTO_DISGUISE_DELAY_MS =
  10 * 60 * 1000;

let autoDisguiseTimer = null;

let readerState = {

  settings: {
    theme: "sepia",
    fontSize: 20,
    lineHeight: 1.9,
    contentWidth: 850,
    brightness: 100
  },

  lastOpenedBookId: null,

  txtProgress: {},

  epubProgress: {}

};


/* =========================================================
   DOM
========================================================= */

const googleLoginBtn =
  document.getElementById("googleLoginBtn");

const loginStatus =
  document.getElementById("loginStatus");

const fileInput =
  document.getElementById("fileInput");

const bookList =
  document.getElementById("bookList");

const bookSearch =
  document.getElementById("bookSearch");

const tocSection =
  document.getElementById("tocSection");

const tocList =
  document.getElementById("tocList");


const emptyScreen =
  document.getElementById("emptyScreen");

const txtReader =
  document.getElementById("txtReader");

const txtScrollArea =
  document.getElementById("txtScrollArea");

const txtContent =
  document.getElementById("txtContent");

const chapterTitle =
  document.getElementById("chapterTitle");

const prevChapterBtn =
  document.getElementById("prevChapterBtn");

const nextChapterBtn =
  document.getElementById("nextChapterBtn");


const epubReader =
  document.getElementById("epubReader");

const epubViewer =
  document.getElementById("epubViewer");

const epubTitle =
  document.getElementById("epubTitle");

const epubPrevBtn =
  document.getElementById("epubPrevBtn");

const epubNextBtn =
  document.getElementById("epubNextBtn");


const settingsPanel =
  document.getElementById("settingsPanel");

const themeSelect =
  document.getElementById("themeSelect");

const fontSizeRange =
  document.getElementById("fontSizeRange");

const lineHeightRange =
  document.getElementById("lineHeightRange");

const fontSizeValue =
  document.getElementById("fontSizeValue");

const lineHeightValue =
  document.getElementById("lineHeightValue");

const contentWidthRange =
  document.getElementById("contentWidthRange");

const contentWidthValue =
  document.getElementById("contentWidthValue");

const settingsBtnMobile =
  document.getElementById("settingsBtnMobile");

const settingsBtnDesktop =
  document.getElementById("settingsBtnDesktop");

const closeSettingsBtn =
  document.getElementById("closeSettingsBtn");

const menuBtn =
  document.getElementById("menuBtn");

const sidebar =
  document.getElementById("sidebar");

const collapseSidebarBtn =
  document.getElementById("collapseSidebarBtn");

const openSidebarBtn =
  document.getElementById("openSidebarBtn");

const overlay =
  document.getElementById("overlay");

const mobileBookTitle =
  document.getElementById("mobileBookTitle");


/* =========================================================
   초기화
========================================================= */

window.addEventListener("load", () => {

  restoreStoredAccessToken();
  restoreLocalReaderState();
  applySettings();

  // 저장된 책부터 즉시 열고, Google Drive 연결은 뒤에서 시도합니다.
  // 로그인/네트워크가 늦어도 독서 화면이 먼저 준비됩니다.
  void initializeOfflineReaderLibrary().then(async () => {
    const lastId = readerState.lastOpenedBookId;
    const local = readOfflineBookIndex().find(book => book.id === lastId);
    if (local && !selectedBook && !isMobileReaderDevice()) {
      try { await openBook(local); }
      catch (error) { console.warn('저장된 책 빠른 복원 실패', error); }
    }
  }).catch(error => console.warn('오프라인 서재 초기화 실패', error));
  if (navigator.onLine) setTimeout(waitForGoogle, 150);

});


function waitForGoogle() {

  if (!navigator.onLine) return;

  if (
    window.google &&
    google.accounts &&
    google.accounts.oauth2
  ) {

    initGoogle();

    return;
  }

  setTimeout(
    waitForGoogle,
    300
  );

}


function initGoogle() {

  tokenClient =
    google.accounts.oauth2.initTokenClient({

      client_id:
        GOOGLE_CLIENT_ID,

      scope:
        GOOGLE_SCOPES,

      callback:
        () => {}

    });


  if (
    navigator.onLine &&
    localStorage.getItem(
      GOOGLE_CONNECTED_KEY
    ) === "1"
  ) {

    autoReconnectGoogleDrive();

  }

}


function saveAccessTokenResponse(response) {

  if (
    !response ||
    !response.access_token
  ) {

    return;

  }


  accessToken =
    response.access_token;


  const expiresIn =
    Number(
      response.expires_in || 3600
    );


  const expiresAt =
    Date.now() +
    expiresIn * 1000;


  localStorage.setItem(
    GOOGLE_ACCESS_TOKEN_KEY,
    accessToken
  );


  localStorage.setItem(
    GOOGLE_ACCESS_TOKEN_EXPIRES_KEY,
    String(expiresAt)
  );

}


function restoreStoredAccessToken() {

  const storedToken =
    localStorage.getItem(
      GOOGLE_ACCESS_TOKEN_KEY
    );


  const storedExpiresAt =
    Number(
      localStorage.getItem(
        GOOGLE_ACCESS_TOKEN_EXPIRES_KEY
      ) || 0
    );


  if (
    storedToken &&
    storedExpiresAt >
      Date.now() + 30000
  ) {

    accessToken =
      storedToken;

    return true;

  }


  clearStoredAccessToken();

  return false;

}


function clearStoredAccessToken() {

  accessToken = "";

  localStorage.removeItem(
    GOOGLE_ACCESS_TOKEN_KEY
  );

  localStorage.removeItem(
    GOOGLE_ACCESS_TOKEN_EXPIRES_KEY
  );

}


/* =========================================================
   GOOGLE 로그인
========================================================= */

googleLoginBtn.addEventListener(
  "click",
  connectGoogleDrive
);


async function connectGoogleDrive() {

  try {

    loginStatus.textContent =
      "Google 로그인 중...";

    await authorize();

    loginStatus.textContent =
      "Drive 확인 중...";

    // Drive 상태는 책 목록 조회보다 중요합니다. 두 요청을 병렬로 진행합니다.
    const [folderId] = await Promise.all([
      ensureLibraryFolder(),
      loadState()
    ]);
    libraryFolderId = folderId;

    applySettings();

    // 독서 화면 복원을 책 목록 네트워크 응답에 묶지 않습니다.
    void loadBooks().catch(error => console.warn('책 목록 갱신 실패', error));

    loginStatus.textContent =
      "Google Drive 연결됨";

    googleLoginBtn.textContent =
      "✓ Google Drive 연결됨";


    localStorage.setItem(
      GOOGLE_CONNECTED_KEY,
      "1"
    );


    if (
      !isMobileReaderDevice() && !selectedBook && readerState.lastOpenedBookId
    ) {

      const book =
        books.find(
          b =>
            b.id ===
            readerState.lastOpenedBookId
        ) || readOfflineBookIndex().find(
          b => b.id === readerState.lastOpenedBookId
        );

      if (book) {

        await openBook(book);

      }

    }

    // 로그인 직후에는 서버 위치를 우선 표시합니다. 실제 변경이 남아 있으면
    // 잠시 후 비동기로 업로드하여 휴대폰 시작을 막지 않습니다.
    if (hasPendingReaderSync()) {
      setTimeout(() => { void saveState(); }, 7000);
    }
    updateOfflineSaveButtons();

  }

  catch (error) {

    console.error(error);

    loginStatus.textContent =
      "Google 연결 실패";

    alert(
      "Google Drive 연결 실패\n\n" +
      error.message
    );

  }

}


async function autoReconnectGoogleDrive() {

  try {

    loginStatus.textContent =
      "Google Drive 자동 연결 중...";


    if (!accessToken) {

      await authorizeSilently();

    }


    const [folderId] = await Promise.all([ensureLibraryFolder(), loadState()]);
    libraryFolderId = folderId;


    applySettings();


    void loadBooks().catch(error => console.warn('책 목록 갱신 실패',error));


    loginStatus.textContent =
      "Google Drive 연결됨";

    googleLoginBtn.textContent =
      "✓ Google Drive 연결됨";


    if (
      !isMobileReaderDevice() && !selectedBook && readerState.lastOpenedBookId
    ) {

      const book =
        books.find(
          b =>
            b.id ===
            readerState.lastOpenedBookId
        ) || readOfflineBookIndex().find(
          b => b.id === readerState.lastOpenedBookId
        );


      if (book) {

        await openBook(book);

      }

    }

    // 로그인 직후에는 서버 위치를 우선 표시합니다. 실제 변경이 남아 있으면
    // 잠시 후 비동기로 업로드하여 휴대폰 시작을 막지 않습니다.
    if (hasPendingReaderSync()) {
      setTimeout(() => { void saveState(); }, 7000);
    }
    updateOfflineSaveButtons();

  }

  catch (error) {

    console.log(
      "Google Drive 자동 연결 실패",
      error
    );


    clearStoredAccessToken();


    loginStatus.textContent =
      "Google Drive 연결 필요";

    googleLoginBtn.textContent =
      "Google Drive 연결";

  }

}


function authorizeSilently() {

  return new Promise(
    (resolve, reject) => {

      if (!tokenClient) {

        reject(
          new Error(
            "Google 인증 준비가 끝나지 않았습니다."
          )
        );

        return;

      }


      tokenClient.callback =
        response => {

          if (response.error) {

            reject(
              new Error(
                response.error
              )
            );

            return;

          }


          saveAccessTokenResponse(
            response
          );


          resolve(
            accessToken
          );

        };


      tokenClient.requestAccessToken({

        prompt: ""

      });

    }
  );

}


function authorize() {

  return new Promise(
    (resolve, reject) => {

      if (!tokenClient) {

        reject(
          new Error(
            "Google 인증 준비가 끝나지 않았습니다."
          )
        );

        return;

      }

      tokenClient.callback =
        response => {

          if (response.error) {

            reject(
              new Error(
                response.error
              )
            );

            return;

          }

          saveAccessTokenResponse(
            response
          );

          resolve(
            accessToken
          );

        };


      tokenClient.requestAccessToken({

        prompt:
          localStorage.getItem(
            GOOGLE_CONNECTED_KEY
          ) === "1"
            ? ""
            : "consent"

      });

    }
  );

}


/* =========================================================
   API 공통
========================================================= */

async function apiFetch(
  url,
  options = {}
) {

  if (!accessToken) {

    try {

      await authorizeSilently();

    }

    catch (error) {

      clearStoredAccessToken();

      throw new Error(
        "Google Drive 재연결이 필요합니다."
      );

    }

  }


  let response =
    await fetch(

      url,

      {

        ...options,

        headers: {

          ...(options.headers || {}),

          Authorization:
            `Bearer ${accessToken}`

        }

      }

    );


  if (
    response.status === 401
  ) {

    clearStoredAccessToken();


    try {

      await authorizeSilently();

    }

    catch (error) {

      throw new Error(
        "Google Drive 로그인 시간이 만료되었습니다. 연결 버튼을 다시 눌러주세요."
      );

    }


    response =
      await fetch(

        url,

        {

          ...options,

          headers: {

            ...(options.headers || {}),

            Authorization:
              `Bearer ${accessToken}`

          }

        }

      );

  }


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      text ||
      `HTTP ${response.status}`
    );

  }


  return response;

}


/* =========================================================
   Drive 폴더
========================================================= */

async function ensureLibraryFolder() {

  const query =
    encodeURIComponent(

      `mimeType='application/vnd.google-apps.folder' and name='${LIBRARY_FOLDER_NAME}' and trashed=false`

    );


  const response =
    await apiFetch(

      "https://www.googleapis.com/drive/v3/files" +
      `?q=${query}` +
      "&fields=files(id,name)"

    );


  const data =
    await response.json();


  if (
    data.files &&
    data.files.length > 0
  ) {

    return data.files[0].id;

  }


  const createResponse =
    await apiFetch(

      "https://www.googleapis.com/drive/v3/files",

      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            name:
              LIBRARY_FOLDER_NAME,

            mimeType:
              "application/vnd.google-apps.folder"

          })

      }

    );


  const folder =
    await createResponse.json();


  return folder.id;

}


/* =========================================================
   책 목록
========================================================= */

async function driveListChildren(folderId) {
  const all = [];
  let pageToken = "";
  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url = "https://www.googleapis.com/drive/v3/files?q=" + query +
      "&fields=" + encodeURIComponent("nextPageToken,files(id,name,mimeType,parents,size,modifiedTime)") +
      "&pageSize=1000&orderBy=" + encodeURIComponent("folder,name") +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const response = await apiFetch(url);
    const data = await response.json();
    all.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return all;
}

async function loadBooks() {
  if (!libraryFolderId) return;
  if (!currentFolderId) currentFolderId = libraryFolderId;
  const requestedFolderId = currentFolderId;
  const items = await driveListChildren(requestedFolderId);
  // Ignore stale responses when a user rapidly opens another folder.
  if (requestedFolderId !== currentFolderId) return;
  folders = items.filter(item => item.mimeType === "application/vnd.google-apps.folder");
  books = items.filter(item => item.mimeType !== "application/vnd.google-apps.folder" && /\.(txt|epub)$/i.test(item.name));
  rememberMobileShelfFolder(requestedFolderId, folders, books);
  renderBooks();
}

function renderBooks() {
  const keyword = bookSearch.value.trim().toLowerCase();
  bookList.innerHTML = "";
  const controls = document.createElement("div");
  controls.className = "library-controls";
  const makeBtn = (label, handler) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.className = "library-action";
    btn.addEventListener("click", handler);
    return btn;
  };
  controls.append(makeBtn("📁 새 폴더", createLibraryFolder), makeBtn("🔄 새로고침", () => runLibraryAction(loadBooks)));
  const breadcrumb = document.createElement("div");
  breadcrumb.className = "library-breadcrumb";
  breadcrumb.append(makeBtn("📚 서재", () => openLibraryFolder(libraryFolderId, [])));
  folderPath.forEach((part, i) => breadcrumb.append(makeBtn("› " + part.name, () => openLibraryFolder(part.id, folderPath.slice(0, i + 1)))));
  bookList.append(controls, breadcrumb);
  if (currentFolderId !== libraryFolderId) {
    bookList.append(makeBtn("⬅ 상위 폴더", () => {
      const parent = folderPath.slice(0, -1);
      openLibraryFolder(parent.length ? parent[parent.length - 1].id : libraryFolderId, parent);
    }));
  }
  folders.filter(f => f.name.toLowerCase().includes(keyword)).forEach(folder => {
    const row = document.createElement("div"); row.className = "library-row";
    const open = makeBtn("📁 " + folder.name, () => openLibraryFolder(folder.id, [...folderPath, {id:folder.id,name:folder.name}]));
    open.classList.add("book-item");
    const menu = makeBtn("⋯", () => showLibraryMenu(folder, true));
    menu.setAttribute("aria-label", folder.name + " 관리");
    row.append(open, menu); bookList.append(row);
  });
  books.filter(b => b.name.toLowerCase().includes(keyword)).forEach(book => {
    const row = document.createElement("div"); row.className = "library-row";
    const open = makeBtn("📖 " + book.name, () => openBook(book));
    open.classList.add("book-item");
    if (selectedBook && selectedBook.id === book.id) open.classList.add("active");
    const menu = makeBtn("⋯", () => showLibraryMenu(book, false));
    menu.setAttribute("aria-label", book.name + " 관리");
    row.append(open, menu); bookList.append(row);
  });
  renderMobileBookshelf();
}

async function runLibraryAction(action) {
  try { await action(); }
  catch (error) { console.error(error); alert("Drive 작업 실패: " + error.message); }
}

async function openLibraryFolder(id, path) {
  await runLibraryAction(async () => {
    currentFolderId = id; folderPath = path; bookSearch.value = "";
    await loadBooks();
  });
}

async function createLibraryFolder() {
  const name = prompt("새 폴더 이름을 입력하세요.");
  if (!name || !name.trim()) return;
  await runLibraryAction(async () => {
    await apiFetch("https://www.googleapis.com/drive/v3/files", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:name.trim(),mimeType:"application/vnd.google-apps.folder",parents:[currentFolderId || libraryFolderId]})
    });
    await loadBooks();
  });
}

async function driveRename(item) {
  const name = prompt("새 이름을 입력하세요.", item.name);
  if (!name || !name.trim() || name === item.name) return;
  if (item.mimeType !== "application/vnd.google-apps.folder" && !/\.(txt|epub)$/i.test(name.trim())) {
    alert("TXT/EPUB 파일 확장자를 유지해 주세요."); return;
  }
  await runLibraryAction(async () => {
    await apiFetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(item.id), {
      method:"PATCH", headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name.trim()})
    });
    if (selectedBook && selectedBook.id === item.id) {
      selectedBook.name = name.trim(); mobileBookTitle.textContent = name.trim();
      if (item.mimeType !== "application/vnd.google-apps.folder") epubTitle.textContent = name.trim();
    }
    if (hasOfflineBook(item.id)) {
      // Drive 이름 변경 후 기기에 저장한 같은 책의 목록도 갱신합니다.
      try {
        const cached = await readOfflineBook(item.id);
        if (cached) await saveOfflineBookRecord({...cached, name:name.trim()});
        cacheOfflineBookIndex({id:item.id,name:name.trim(),
          mimeType:item.mimeType});
      } catch (error) { console.warn('오프라인 이름 갱신 실패',error); }
    }
    await loadBooks();
  });
}

async function listAllFolders(rootId, ancestorIds = new Set(), depth = 0) {
  if (depth > 20) return [];
  const children = await driveListChildren(rootId);
  const result = [];
  for (const child of children.filter(x => x.mimeType === "application/vnd.google-apps.folder")) {
    if (ancestorIds.has(child.id)) continue;
    result.push({id:child.id,name:child.name,depth});
    const next = new Set(ancestorIds); next.add(child.id);
    result.push(...await listAllFolders(child.id, next, depth + 1));
  }
  return result;
}

async function driveMove(item, isFolder) {
  await runLibraryAction(async () => {
    const destinations = [{id:libraryFolderId,name:"📚 서재 (최상위)",depth:0}, ...await listAllFolders(libraryFolderId)];
    const filtered = destinations.filter(f => f.id !== item.id);
    const names = filtered.map((f,i) => `${i + 1}. ${"　".repeat(f.depth)}${f.name}`);
    const choice = prompt("이동할 폴더 번호를 입력하세요.\n\n" + names.join("\n"));
    if (choice === null) return;
    const index = Number(choice) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= filtered.length) { alert("올바른 번호를 입력하세요."); return; }
    const target = filtered[index];
    if (target.id === currentFolderId) return;
    if (isFolder) {
      const descendants = await listAllFolders(item.id);
      if (descendants.some(f => f.id === target.id)) { alert("폴더를 자신의 하위 폴더로 이동할 수 없습니다."); return; }
    }
    const parentId = (item.parents || [currentFolderId])[0];
    const params = new URLSearchParams({addParents:target.id,fields:"id,name,parents"});
    if (parentId) params.set("removeParents",parentId);
    await apiFetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(item.id) + "?" + params.toString(), {method:"PATCH"});
    await loadBooks();
  });
}

function showLibraryMenu(item, isFolder) {
  const action = prompt(`「${item.name}」 관리\n1. 이름 변경\n2. 다른 폴더로 이동\n\n번호를 입력하세요.`);
  if (action === "1") driveRename(item);
  else if (action === "2") driveMove(item, isFolder);
}

bookSearch.addEventListener(
  "input",
  renderBooks
);


/* =========================================================
   업로드
========================================================= */

fileInput.addEventListener(
  "change",
  handleFileUpload
);


async function handleFileUpload(event) {

  const files =
    Array.from(
      event.target.files
    );


  if (!files.length) {
    return;
  }


  if (!accessToken) {

    alert(
      "먼저 Google Drive를 연결하세요."
    );

    event.target.value = "";

    return;

  }


  for (
    const file of files
  ) {

    if (
      !/\.(txt|epub)$/i
        .test(file.name)
    ) {

      continue;

    }


    loginStatus.textContent =
      `${file.name} 업로드 중...`;


    await uploadBook(file);

  }


  event.target.value = "";


  await loadBooks();


  loginStatus.textContent =
    "업로드 완료";

}


/* =========================================================
   multipart 업로드
========================================================= */

async function uploadBook(file) {

  const metadata = {

    name:
      file.name,

    parents: [
      currentFolderId || libraryFolderId
    ]

  };


  return multipartUpload(
    metadata,
    file
  );

}


async function multipartUpload(
  metadata,
  blob,
  fileId = null
) {

  const boundary =
    "reader_" +
    Math.random()
      .toString(36)
      .substring(2);


  const body =
    new Blob(

      [

        `--${boundary}\r\n`,

        "Content-Type: application/json; charset=UTF-8\r\n\r\n",

        JSON.stringify(metadata),

        `\r\n--${boundary}\r\n`,

        `Content-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,

        blob,

        `\r\n--${boundary}--`

      ],

      {

        type:
          `multipart/related; boundary=${boundary}`

      }

    );


  const url =
    fileId

      ?

      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`

      :

      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";


  const response =
    await apiFetch(

      url,

      {

        method:
          fileId
            ? "PATCH"
            : "POST",

        headers: {

          "Content-Type":
            `multipart/related; boundary=${boundary}`

        },

        body

      }

    );


  return response.json();

}


/* =========================================================
   책 열기
========================================================= */

async function openBook(book) {

  if (isMobileReaderDevice()) hideMobileBookshelf();

  selectedBook =
    book;


  renderBooks();


  mobileBookTitle.textContent =
    book.name;


  readerState.lastOpenedBookId =
    book.id;


  scheduleStateSave();


  prepareMobilePagedBook();


  emptyScreen.classList.add(
    "hidden"
  );


  txtReader.classList.add(
    "hidden"
  );


  epubReader.classList.add(
    "hidden"
  );


  if (
    book.name
      .toLowerCase()
      .endsWith(".txt")
  ) {

    await openTxtBook(book);

  }

  else {

    await openEpubBook(book);

  }


  closeMobileMenu();


  setMobileReadingControlsVisible(false);

  if (isMobilePagedReading() && isMobileTxtBook() && !isVirtualMobileTxt()) {
    requestAnimationFrame(() =>
      finishMobileTxtRender(readerState.txtProgress[book.id]?.pageRatio ??
        readerState.txtProgress[book.id]?.scrollRatio ?? 0));
  }

  resetAutoDisguiseTimer();
  updateOfflineSaveButtons();

  // 오프라인 책이 로딩되는 사이 Drive 동기화가 먼저 완료되었을 때도
  // 책 로딩이 끝난 후 최종 원격 위치를 다시 적용합니다.
  if (deferredRemoteBookPosition?.bookId === book.id) {
    const deferred = deferredRemoteBookPosition;
    deferredRemoteBookPosition = null;
    await applyLatestCloudPositionToOpenBook(deferred.previous, book.id);
  }

}


/* =========================================================
   Drive 파일 다운로드
========================================================= */

async function downloadDriveFile(fileId) {
  // 명시적으로 오프라인 저장한 책은 네트워크 없이도 그대로 열 수 있습니다.
  let saved = null;
  try { saved = await readOfflineBook(fileId); }
  catch (error) {
    console.warn('기기 저장소 조회 실패', error);
    if (!navigator.onLine) throw new Error('이 기기에서 오프라인 저장소를 열 수 없습니다.');
  }
  if (saved?.blob) {
    return new Response(saved.blob, {
      status: 200,
      headers: {"Content-Type": saved.mimeType || "application/octet-stream"}
    });
  }

  if (!navigator.onLine) {
    throw new Error("이 책은 아직 오프라인 저장되지 않았습니다. 인터넷에 연결해 저장해 주세요.");
  }
  return apiFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
}


/* =========================================================
   TXT 열기
========================================================= */

async function openTxtBook(book) {

  destroyEpub();

  // v14: 다운로드한 TXT의 분리된 장을 우선 불러옵니다.
  // 캐시가 있으면 원본 Blob 디코딩/정규식 장 분리를 반복하지 않습니다.
  let stored = null;
  const localBook = hasOfflineBook(book.id) ? await readOfflineBook(book.id) : null;
  if (localBook?.blob) {
    const parsed = await readReaderCacheRecord(TXT_PARSED_STORE, book.id);
    if (parsed?.version === TXT_CACHE_FORMAT_VERSION &&
        parsed.savedAt === localBook.savedAt &&
        Array.isArray(parsed.chapters) && parsed.chapters.length) {
      stored = parsed.chapters;
    }
  }
  if (!stored) {
    const response = await downloadDriveFile(book.id);
    const text = await response.text();
    stored = splitTxtIntoChapters(text);
    if (localBook?.blob) {
      await writeReaderCacheRecord(TXT_PARSED_STORE, {
        id: book.id, savedAt: localBook.savedAt,
        version: TXT_CACHE_FORMAT_VERSION, chapters: stored
      });
    }
  }
  txtChapters = stored;
  buildMobileTxtLengthIndex();


  const progress =
    readerState
      .txtProgress[
        book.id
      ] || {};


  currentTxtChapter =
    Math.min(

      progress.chapterIndex || 0,

      txtChapters.length - 1

    );


  renderTxtChapter(
    isMobilePagedReading() ?
      (progress.pageRatio ?? progress.scrollRatio ?? 0) :
      (progress.scrollRatio || 0)
  );


  renderTxtToc();


  txtReader.classList.remove(
    "hidden"
  );


  epubReader.classList.add(
    "hidden"
  );

}


/* =========================================================
   TXT 자동 장 분리
========================================================= */

function splitTxtIntoChapters(
  text
) {

  const normalized =
    text.replace(
      /\r\n/g,
      "\n"
    );


  const lines =
    normalized.split("\n");


  const chapterRegex =
    /^\s*(?:(?:第\s*[0-9０-９零〇一二三四五六七八九十百千万萬兩两]+\s*[章节章節卷巻话話回篇部])|(?:Chapter\s+\d+)|(?:CHAPTER\s+\d+)|序章|序言|楔子|前言|终章|終章|后记|後記|番外(?:篇)?)(?:[\s：:\-—　].*)?\s*$/i;


  const positions = [];


  lines.forEach(
    (line, index) => {

      if (
        chapterRegex.test(
          line.trim()
        )
      ) {

        positions.push(
          index
        );

      }

    }
  );


  if (
    positions.length === 0
  ) {

    return [

      {

        title: "全文",

        content:
          normalized

      }

    ];

  }


  const chapters = [];


  if (
    positions[0] > 0
  ) {

    const intro =
      lines
        .slice(
          0,
          positions[0]
        )
        .join("\n")
        .trim();


    if (intro) {

      chapters.push({

        title: "前文",

        content: intro

      });

    }

  }


  positions.forEach(
    (start, index) => {

      const end =
        index + 1 <
        positions.length

          ?

          positions[index + 1]

          :

          lines.length;


      const title =
        lines[start]
          .trim();


      const content =
        lines
          .slice(
            start,
            end
          )
          .join("\n")
          .trim();


      chapters.push({

        title,

        content

      });

    }
  );


  return chapters;

}


/* =========================================================
   TXT 표시
========================================================= */

function renderTxtChapter(
  restoreRatio = 0
) {

  const chapter =
    txtChapters[
      currentTxtChapter
    ];


  if (!chapter) {
    return;
  }


  chapterTitle.textContent =
    chapter.title;


  if (isMobilePagedReading() && isMobileTxtBook()) {
    txtContent.textContent = '읽던 페이지를 준비하는 중...';
  } else {
    txtContent.textContent = chapter.content;
  }


  prevChapterBtn.disabled =
    currentTxtChapter <= 0;


  nextChapterBtn.disabled =
    currentTxtChapter >=
    txtChapters.length - 1;


  requestAnimationFrame(
    () => {

      requestAnimationFrame(
        () => {

          const max =
            txtScrollArea.scrollHeight -
            txtScrollArea.clientHeight;


          if (isVirtualMobileTxt()) {
            void activateVirtualTxtChapter(restoreRatio);
          } else if (isMobilePagedReading()) {
            finishMobileTxtRender(restoreRatio);
          } else {
            txtScrollArea.scrollTop = max > 0 ? max * restoreRatio : 0;
          }

        }
      );

    }
  );


  renderTxtToc();

}


/* =========================================================
   TXT 목차
========================================================= */

function renderTxtToc() {

  tocSection.classList.remove(
    "hidden"
  );


  tocList.innerHTML = "";


  txtChapters.forEach(
    (chapter, index) => {

      const button =
        document.createElement(
          "button"
        );


      button.className =
        "toc-item";


      if (
        index ===
        currentTxtChapter
      ) {

        button.classList.add(
          "active"
        );

      }


      button.textContent =
        chapter.title;


      button.addEventListener(
        "click",
        () => {

          moveTxtChapter(
            index
          );

        }
      );


      tocList.appendChild(
        button
      );

    }
  );

}


/* =========================================================
   TXT 장 이동
========================================================= */

async function moveTxtChapter(
  index,
  restoreRatio = 0
) {

  if (
    index < 0 ||
    index >=
      txtChapters.length
  ) {

    return;

  }


  const previousTxtChapter =
    currentTxtChapter;


  currentTxtChapter =
    index;


  if (
    currentTxtChapter >
    previousTxtChapter
  ) {

    resetAutoDisguiseTimer();

  }


  readerState
    .txtProgress[
      selectedBook.id
    ] = {

      chapterIndex:
        currentTxtChapter,

      scrollRatio: restoreRatio,
      pageRatio: restoreRatio

    };


  if (isVirtualMobileTxt()) virtualTxtEpoch++;
  renderTxtChapter(restoreRatio);


  scheduleStateSave();

}


prevChapterBtn.addEventListener(
  "click",
  () => {

    moveTxtChapter(
      currentTxtChapter - 1
    );

  }
);


nextChapterBtn.addEventListener(
  "click",
  () => {

    moveTxtChapter(
      currentTxtChapter + 1
    );

  }
);


/* =========================================================
   TXT 스크롤 저장
========================================================= */

txtScrollArea.addEventListener(
  "scroll",
  () => {

    if (
      !selectedBook ||
      !selectedBook.name
        .toLowerCase()
        .endsWith(".txt")
    ) {

      return;

    }


    clearTimeout(
      scrollSaveTimer
    );


    scrollSaveTimer =
      setTimeout(
        saveTxtScroll,
        800
      );

  }
);


function saveTxtScroll() {

  if (isMobilePagedReading() && isMobileTxtBook()) {
    rememberMobileTxtProgress();
    return;
  }

  const max =
    txtScrollArea.scrollHeight -
    txtScrollArea.clientHeight;


  const ratio =
    max > 0

      ?

      txtScrollArea.scrollTop /
      max

      :

      0;


  readerState
    .txtProgress[
      selectedBook.id
    ] = {

      chapterIndex:
        currentTxtChapter,

      scrollRatio:
        ratio

    };


  scheduleStateSave();

}


/* =========================================================
   EPUB
========================================================= */

async function openEpubBook(
  book
) {

  destroyEpub();


  const response =
    await downloadDriveFile(
      book.id
    );


  const blob =
    await response.blob();


  epubObjectUrl =
    URL.createObjectURL(
      blob
    );


  epubBook =
    ePub(
      epubObjectUrl
    );


  epubRendition =
    epubBook.renderTo(

      "epubViewer",

      {

        width: "100%",

        height: "100%",

        flow: isMobilePagedReading() ?
          "paginated" : "scrolled-doc"

      }

    );


  // EPUB 본문은 iframe 안에 있기 때문에 별도로 터치 이벤트를 연결합니다.
  // 리더가 내부 페이지를 다시 렌더링해도 자동으로 적용됩니다.
  epubRendition.hooks.content.register(
    contents => {

      if (contents && contents.document) {

        bindMobilePageGestures(contents.document, contents.document);

      }

    }
  );


  const progress =
    readerState
      .epubProgress[
        book.id
      ] || {};


  epubRendition.on("relocated", location => {
    mobilePageState.epubLocation = location;
    updateMobileProgressDisplay();
  });

  await epubRendition.display(
    progress.cfi || undefined
  );

  startMobileEpubLocations(epubBook);


  epubTitle.textContent =
    book.name;


  epubRendition.on(

    "relocated",

    location => {

      const cfi =
        location?.start?.cfi;


      if (!cfi) {
        return;
      }


      if (readerCloudApplyInProgress) return;

      readerState
        .epubProgress[
          book.id
        ] = {

          cfi

        };


      scheduleStateSave();
      updateMobileProgressDisplay();

    }

  );


  const navigation =
    await epubBook.loaded.navigation;


  renderEpubToc(
    navigation.toc || []
  );


  applyEpubSettings();


  txtReader.classList.add(
    "hidden"
  );


  epubReader.classList.remove(
    "hidden"
  );

}


function renderEpubToc(
  toc
) {

  tocSection.classList.remove(
    "hidden"
  );


  tocList.innerHTML = "";


  function addItems(
    items,
    depth = 0
  ) {

    items.forEach(
      item => {

        const button =
          document.createElement(
            "button"
          );


        button.className =
          "toc-item";


        button.style.paddingLeft =
          `${10 + depth * 14}px`;


        button.textContent =
          item.label;


        button.addEventListener(
          "click",
          () => {

            epubRendition
              ?.display(
                item.href
              );

            closeMobileMenu();

          }
        );


        tocList.appendChild(
          button
        );


        if (
          item.subitems &&
          item.subitems.length
        ) {

          addItems(
            item.subitems,
            depth + 1
          );

        }

      }
    );

  }


  addItems(toc);

}


epubPrevBtn.addEventListener(
  "click",
  () => {

    epubRendition
      ?.prev();

  }
);


epubNextBtn.addEventListener(
  "click",
  () => {

    resetAutoDisguiseTimer();

    epubRendition
      ?.next();

  }
);


function destroyEpub() {

  if (epubRendition) {

    try {

      epubRendition.destroy();

    }

    catch (e) {

      console.log(e);

    }

  }


  if (epubBook) {

    try {

      epubBook.destroy();

    }

    catch (e) {

      console.log(e);

    }

  }


  if (epubObjectUrl) {

    URL.revokeObjectURL(
      epubObjectUrl
    );

  }


  epubViewer.innerHTML = "";


  epubRendition = null;
  epubBook = null;
  epubObjectUrl = null;

}


/* =========================================================
   Reader 설정
========================================================= */

themeSelect.addEventListener(
  "change",
  () => {

    readerState.settings.theme =
      themeSelect.value;

    applySettings();

    scheduleStateSave();

  }
);


fontSizeRange.addEventListener(
  "input",
  () => {

    readerState.settings.fontSize =
      Number(
        fontSizeRange.value
      );

    applySettings();

    scheduleStateSave();

  }
);


lineHeightRange.addEventListener(
  "input",
  () => {

    readerState.settings.lineHeight =
      Number(
        lineHeightRange.value
      );

    applySettings();

    scheduleStateSave();

  }
);

contentWidthRange.addEventListener(
  "input",
  () => {

    readerState.settings.contentWidth =
      Number(
        contentWidthRange.value
      );

    applySettings();

    scheduleStateSave();

  }
);


function applySettings() {

  const settings =
    readerState.settings;


  document.body.classList.remove(

    "theme-light",
    "theme-sepia",
    "theme-green",
    "theme-dark"

  );


  document.body.classList.add(
    `theme-${settings.theme}`
  );


  themeSelect.value =
    settings.theme;


  fontSizeRange.value =
    settings.fontSize;


  lineHeightRange.value =
    settings.lineHeight;


  contentWidthRange.value =
    settings.contentWidth || 850;


  fontSizeValue.textContent =
    `${settings.fontSize}px`;


  lineHeightValue.textContent =
    settings.lineHeight;


  contentWidthValue.textContent =
    `${settings.contentWidth || 850}px`;



  txtContent.style.fontSize =
    `${settings.fontSize}px`;


  txtContent.style.lineHeight =
    settings.lineHeight;

  txtContent.style.width =
    `min(${readerState.settings.contentWidth || 850}px, 96%)`;

   
  applyEpubSettings();
  applyReaderBrightness();
  if (isVirtualMobileTxt() && virtualTxtActive &&
      virtualTxtActive.signature !== virtualTxtLayoutSignature()) {
    void virtualTxtRefreshAfterResize();
  }

  if (isMobilePagedReading() && isMobileTxtBook() && !isVirtualMobileTxt()) {
    const ratio = mobilePageState.txtPages <= 1 ? 0 :
      mobilePageState.txtPageIndex / (mobilePageState.txtPages - 1);
    requestAnimationFrame(() => finishMobileTxtRender(ratio));
  }

}


function applyEpubSettings() {

  if (!epubRendition) {
    return;
  }


  const settings =
    readerState.settings;


  let background;
  let color;


  if (
    settings.theme ===
    "dark"
  ) {

    background =
      "#151515";

    color =
      "#ededed";

  }

  else if (
    settings.theme ===
    "light"
  ) {

    background =
      "#ffffff";

    color =
      "#222222";

  }

  else if (
    settings.theme ===
    "green"
  ) {

    background =
      "#cfe8cf";

    color =
      "#263a2b";

  }

  else {

    background =
      "#f6ecd8";

    color =
      "#3f3125";

  }


  epubRendition.themes.default({

    body: {

      "background":
        `${background} !important`,

      "color":
        `${color} !important`,

      "font-size":
        `${settings.fontSize}px !important`,

      "line-height":
        `${settings.lineHeight} !important`,

      "padding":
        "20px !important"

    }

  });

}


/* =========================================================
   상태 저장
========================================================= */

function scheduleStateSave() {
  persistPendingReaderState();
  clearTimeout(stateSaveTimer);
  if (navigator.onLine && cloudReaderStateReady && accessToken) {
    stateSaveTimer = setTimeout(() => { void saveState(); },
      isMobileReadingLayout() ? 3500 : 1600);
  }
}


/* =========================================================
   appData 상태 읽기
========================================================= */

/* =========================================================
   v15: 다른 기기 읽던 위치 동기화
   - 저장된 책/페이지를 다시 다운로드하지 않고 상태 JSON만 조회
   - 실질적인 페이지 이동만 업로드 대상으로 기록
   - 읽기 위치 변경 시각을 비교해서 이전 기기 정보로 덮어쓰지 않음
========================================================= */

let readerStateRefreshInFlight = null;
let lastReaderCloudCheckAt = 0;
let readerProgressMutationCounter = 0;
let readerCloudApplyInProgress = false;
let deferredRemoteBookPosition = null;
let lastFetchedDriveReadingState = null;

function normalizeReaderCloudState(parsed = {}) {
  return {
    settings: {
      theme: parsed.settings?.theme || "sepia",
      fontSize: parsed.settings?.fontSize || 20,
      lineHeight: parsed.settings?.lineHeight || 1.9,
      contentWidth: parsed.settings?.contentWidth || 850,
      brightness: Math.max(20, Math.min(100,
        Number(parsed.settings?.brightness ?? 100)))
    },
    lastOpenedBookId: parsed.lastOpenedBookId || null,
    txtProgress: structuredClone(parsed.txtProgress || {}),
    epubProgress: structuredClone(parsed.epubProgress || {})
  };
}

function comparableBookPosition(position) {
  if (!position) return null;
  // 읽던 글자 위치가 같으면 기기별 갱신 시각 차이로 재업로드하지 않습니다.
  const {updatedAt, userUpdatedAt, ...fields} = position;
  return fields;
}

function isSameBookPosition(a, b) {
  return JSON.stringify(comparableBookPosition(a)) ===
    JSON.stringify(comparableBookPosition(b));
}

/* v16: 휴대폰의 오래된 동기화 대기 기록이 PC의 더 앞선 장을 덮어쓰지 않도록 합니다. */
function readerPositionOrder(a, b) {
  if (!a || !b) return null;
  if (Number.isFinite(Number(a.chapterIndex)) && Number.isFinite(Number(b.chapterIndex))) {
    const ac = Number(a.chapterIndex), bc = Number(b.chapterIndex);
    if (ac !== bc) return Math.sign(ac - bc);
    // 서로 다른 기기의 한 페이지 분량은 다르므로 같은 장이면 인덱스보다 문자 비율을 우선합니다.
    const ar = Number(a.pageRatio ?? a.scrollRatio);
    const br = Number(b.pageRatio ?? b.scrollRatio);
    if (Number.isFinite(ar) && Number.isFinite(br) && Math.abs(ar - br) > 0.02)
      return Math.sign(ar - br);
    return 0;
  }
  return null; // EPUB CFI 등은 시간 기준 비교
}

// v17: 이전 버전의 updatedAt은 자동 복원만으로 갱신될 수 있었습니다.
// 진짜 사용자 조작 시각(userUpdatedAt)만 신뢰합니다.
function compareCloudAndDeviceProgress(device, cloud) {
  if (!device) return cloud ? 'cloud' : 'same';
  if (!cloud) return 'device';
  const dTrusted = Number(device.userUpdatedAt || 0);
  const cTrusted = Number(cloud.userUpdatedAt || 0);
  if (dTrusted && cTrusted && dTrusted !== cTrusted) {
    return dTrusted > cTrusted ? 'device' : 'cloud';
  }
  const order = readerPositionOrder(device, cloud);
  // 새 버전에서 사용자가 실제로 이동한 이력이 로컬에만 있다면 그 조작을 존중합니다.
  if (dTrusted && !cTrusted) return 'device';
  // 반대로 구버전 오프라인 휴대폰이 더 앞까지 읽혀 있었다면
  // 서버 쪽 새 버전 시각 때문에 오프라인 진행분이 사라지지 않도록 보존합니다.
  if (cTrusted && !dTrusted && order !== null && order > 0) return 'device';
  if (cTrusted && !dTrusted) return 'cloud';
  // 양쪽 모두 구버전일 때는 잘못 기록된 시간 대신 실제 읽은 장/위치를 비교합니다.
  if (order !== null && order !== 0) return order > 0 ? 'device' : 'cloud';
  if (isSameBookPosition(device, cloud)) return 'same';
  // 정확히 비교할 수 없는 EPUB CFI 등은 양쪽의 갱신 시각을 사용합니다.
  const dt = Number(device.updatedAt || 0);
  const ct = Number(cloud.updatedAt || 0);
  return dt > ct && dt > 0 ? 'device' : 'cloud';
}

let readerUserActionUntil = 0;
// 프로그램이 자동으로 연 책과 달리 실제 사용자 조작만 강한 로컬 변경으로 취급
for (const name of ['pointerdown', 'wheel', 'keydown']) {
  document.addEventListener(name, event => {
    if (!event.isTrusted) return;
    const el = event.target;
    if (el?.closest?.('#txtReader, #epubReader, #tocList, #mobileReaderUi') ||
        (name === 'keydown' && ['ArrowLeft','ArrowRight','PageDown','PageUp'].includes(event.key))) {
      readerUserActionUntil = Date.now() + 4000;
    }
  }, {capture:true, passive:true});
}

function hasPendingProgressForBook(bookId) {
  const pending = getPendingReaderSync();
  return !!(pending && [2, 3, 4].includes(pending.schemaVersion) && pending.bookIds?.[bookId]);
}

async function applyLatestCloudPositionToOpenBook(previous, bookId) {
  if (!bookId || selectedBook?.id !== bookId ||
      hasPendingProgressForBook(bookId)) return;
  const current = selectedBook.name.toLowerCase().endsWith('.txt')
    ? readerState.txtProgress?.[bookId]
    : readerState.epubProgress?.[bookId];
  if (!current || isSameBookPosition(previous, current)) return;

  if (selectedBook.name.toLowerCase().endsWith('.txt')) {
    if (!txtChapters?.length) {
      deferredRemoteBookPosition = {bookId, previous};
      return;
    }
    const chapter = Math.max(0, Math.min(txtChapters.length - 1,
      Number(current.chapterIndex) || 0));
    const ratio = Math.max(0, Math.min(1,
      Number(current.pageRatio ?? current.scrollRatio ?? 0)));
    readerCloudApplyInProgress = true;
    try {
      currentTxtChapter = chapter;
      renderTxtChapter(ratio);
      updateMobileProgressDisplay();
    } finally {
      // requestAnimationFrame에서 페이지 복원이 완료되는 동안 저장 추적 방지
      setTimeout(() => { readerCloudApplyInProgress = false; }, 1200);
    }
  } else if (epubRendition && current.cfi) {
    readerCloudApplyInProgress = true;
    try { await epubRendition.display(current.cfi); }
    catch (error) { console.warn('EPUB 최신 위치 적용 실패', error); }
    finally { readerCloudApplyInProgress = false; }
  }
  updateOfflineSyncStatus('다른 기기에서 읽던 위치를 불러왔습니다.');
}

async function refreshReaderStateFromDrive({applyToOpenedBook = true} = {}) {
  if (!navigator.onLine || !accessToken) return false;
  if (readerStateRefreshInFlight) return readerStateRefreshInFlight;

  readerStateRefreshInFlight = (async () => {
    const activeId = selectedBook?.id || null;
    const wasTxt = !!selectedBook?.name?.toLowerCase().endsWith('.txt');
    const previous = activeId ? structuredClone(
      wasTxt ? readerState.txtProgress?.[activeId] || null :
        readerState.epubProgress?.[activeId] || null) : null;
    const startMutation = readerProgressMutationCounter;
    try {
      if (!stateFileId) {
        const query = encodeURIComponent(
          `name='${STATE_FILE_NAME}' and trashed=false`);
        const response = await apiFetch(
          'https://www.googleapis.com/drive/v3/files' +
          '?spaces=appDataFolder' + `&q=${query}` + '&fields=files(id,name)');
        const found = await response.json();
        stateFileId = found.files?.[0]?.id || '';
      }
      let remote = {};
      if (stateFileId) {
        const response = await apiFetch(
          `https://www.googleapis.com/drive/v3/files/${stateFileId}?alt=media`);
        remote = JSON.parse(await response.text());
      }
      // 병합 전 원본 서버 위치를 보존해 진단/표시에 사용합니다.
      lastFetchedDriveReadingState = normalizeReaderCloudState(remote);
      readerState = normalizeReaderCloudState(remote);
      cloudReaderStateReady = true;
      applyPendingReaderState();
      lastReaderCloudCheckAt = Date.now();
      // 사용자가 네트워크 요청 중 페이지를 넘겼다면 화면을 자동 이동하지 않습니다.
      if (applyToOpenedBook && activeId && selectedBook?.id === activeId &&
          startMutation === readerProgressMutationCounter &&
          !document.hidden && !mobilePageState.pageTurning &&
          !mobilePageState.activeDrag) {
        await applyLatestCloudPositionToOpenBook(previous, activeId);
      }
      return true;
    } catch (error) {
      console.warn('다른 기기 읽던 위치 확인 실패', error);
      if (!cloudReaderStateReady) restoreLocalReaderState();
      return false;
    }
  })();
  try { return await readerStateRefreshInFlight; }
  finally { readerStateRefreshInFlight = null; }
}

async function loadState() {
  await refreshReaderStateFromDrive();
}


/* =========================================================
   appData 상태 저장
========================================================= */

let readerStateUploadInFlight = null;
async function saveState() {
  // 인터넷이 끊겨도 위치는 이미 기기에 기록되어 있습니다.
  if (!navigator.onLine || !accessToken || !cloudReaderStateReady ||
      !hasPendingReaderSync()) return false;
  if (readerStateUploadInFlight) return readerStateUploadInFlight;

  readerStateUploadInFlight = (async () => {
    // 최신 Drive 데이터를 병합한 뒤 현재 기기에서 실제 변경한 책만 우선 적용합니다.
    const refreshed = await refreshReaderStateFromDrive({applyToOpenedBook: false});
    if (!refreshed || !hasPendingReaderSync()) return false;
    const pendingVersion = getPendingReaderSync()?.version;
    const snapshot = JSON.parse(JSON.stringify(readerState));
    try {
      const blob = new Blob([JSON.stringify(snapshot, null, 2)],
        {type: "application/json"});
      const metadata = stateFileId
        ? {name: STATE_FILE_NAME}
        : {name: STATE_FILE_NAME, parents: ["appDataFolder"]};
      const result = await multipartUpload(metadata, blob, stateFileId || null);
      if (!stateFileId) stateFileId = result.id;
      // 업로드 도중 사용자가 더 읽은 경우에는 새 위치를 지우지 않습니다.
      if (getPendingReaderSync()?.version === pendingVersion) {
        localStorage.removeItem(OFFLINE_PENDING_STATE_KEY);
        updateOfflineSyncStatus("Google Drive에 읽던 위치 저장됨");
      }
      else {
        setTimeout(() => { void saveState(); }, 300);
      }
      return true;
    } catch (error) {
      console.warn("읽던 위치 온라인 동기화 대기", error);
      updateOfflineSyncStatus("읽던 위치 기기에 저장됨 · 재연결 후 동기화");
      return false;
    }
  })();
  try { return await readerStateUploadInFlight; }
  finally { readerStateUploadInFlight = null; }
}


/* =========================================================
   설정창
========================================================= */

settingsBtnMobile.addEventListener(
  "click",
  openSettings
);


settingsBtnDesktop.addEventListener(
  "click",
  openSettings
);


closeSettingsBtn.addEventListener(
  "click",
  closeSettings
);


function openSettings() {

  settingsPanel.classList.remove(
    "hidden"
  );

}


function closeSettings() {

  settingsPanel.classList.add(
    "hidden"
  );

}


/* =========================================================
   Ctrl + G 위장 모드
========================================================= */

const ORIGINAL_DOCUMENT_TITLE =
  document.title;

let disguiseMode = false;
let disguiseOverlay = null;


function createDisguiseOverlay() {

  if (disguiseOverlay) {
    return;
  }


  disguiseOverlay =
    document.createElement(
      "div"
    );


  disguiseOverlay.id =
    "disguiseOverlay";


  Object.assign(
    disguiseOverlay.style,
    {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      background: "#000000",
      zIndex: "2147483647",
      display: "none",
      margin: "0",
      padding: "0"
    }
  );


  document.body.appendChild(
    disguiseOverlay
  );

}


function setDisguiseMode(
  enabled
) {

  createDisguiseOverlay();


  disguiseMode =
    enabled;


  if (disguiseMode) {

    disguiseOverlay.style.display =
      "block";

    document.title =
      "\u200B";

    document.body.style.cursor =
      "none";

  }

  else {

    disguiseOverlay.style.display =
      "none";

    document.title =
      ORIGINAL_DOCUMENT_TITLE;

    document.body.style.cursor =
      "";

  }

}


function clearAutoDisguiseTimer() {

  if (autoDisguiseTimer) {

    clearTimeout(
      autoDisguiseTimer
    );

    autoDisguiseTimer = null;

  }

}


/* Android 및 모바일 기기에서는 자동 검은 화면을 사용하지 않습니다.
   Windows PC에서는 기존 10분 타이머를 그대로 사용합니다.
   수동 Ctrl+G 위장 기능은 변경하지 않습니다. */
function isMobileReaderDevice() {

  return (
    navigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(
      navigator.userAgent || ""
    )
  );

}


function resetAutoDisguiseTimer() {

  clearAutoDisguiseTimer();


  if (
    !selectedBook ||
    disguiseMode ||
    isMobileReaderDevice()
  ) {

    return;

  }


  autoDisguiseTimer =
    setTimeout(
      () => {

        autoDisguiseTimer = null;

        if (
          selectedBook &&
          !disguiseMode &&
          !isMobileReaderDevice()
        ) {

          setDisguiseMode(true);

        }

      },
      AUTO_DISGUISE_DELAY_MS
    );

}


document.addEventListener(
  "keydown",
  event => {

    if (
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key.toLowerCase() === "g"
    ) {

      event.preventDefault();
      event.stopPropagation();

      const willHide =
        !disguiseMode;


      setDisguiseMode(
        willHide
      );


      if (willHide) {

        clearAutoDisguiseTimer();

      }

      else {

        resetAutoDisguiseTimer();

      }

    }

  },
  true
);


/* =========================================================
   PC 사이드바 접기 / 펴기
========================================================= */

collapseSidebarBtn.addEventListener(
  "click",
  () => {

    document
      .getElementById("app")
      .classList.add(
        "sidebar-collapsed"
      );

    openSidebarBtn.classList.remove(
      "hidden"
    );

  }
);


openSidebarBtn.addEventListener(
  "click",
  () => {

    document
      .getElementById("app")
      .classList.remove(
        "sidebar-collapsed"
      );

    openSidebarBtn.classList.add(
      "hidden"
    );

  }
);


/* =========================================================
   모바일 메뉴
========================================================= */

menuBtn.addEventListener(
  "click",
  () => {

    sidebar.classList.toggle(
      "open"
    );


    if (
      sidebar.classList
        .contains("open")
    ) {

      overlay.classList.remove(
        "hidden"
      );

    }

    else {

      overlay.classList.add(
        "hidden"
      );

    }

  }
);


overlay.addEventListener(
  "click",
  closeMobileMenu
);


function closeMobileMenu() {

  sidebar.classList.remove(
    "open"
  );


  overlay.classList.add(
    "hidden"
  );

}


/* =========================================================
   페이지 떠날 때 위치 저장
========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      selectedBook &&
      selectedBook.name
        .toLowerCase()
        .endsWith(".txt")
    ) {

      saveTxtScroll();

    }

  }
);
/* =========================================================
   휴대폰 페이지형 독서 모드 (TXT / EPUB)
   - PC는 기존 세로 스크롤 방식 유지
   - 좌우 탭/스와이프: 페이지 이동
   - 가운데 터치: 읽기 메뉴 표시/숨김
   - 진행바: 책 전체 위치 이동
   - 하단 이전 장 / 다음 장: 페이지가 아닌 장 이동
========================================================= */

const mobilePageState = {
  controls: null,
  slider: null,
  progressLabel: null,
  subtitle: null,
  controlsVisible: false,
  txtPages: 1,
  txtPageIndex: 0,
  chapterPrefix: [0],
  totalChars: 1,
  epubLocationsReady: false,
  epubLocationBook: null,
  epubLocation: null,
  sliderDragging: false,
  resizeTimer: null,
  pageTurning: false,
  activeDrag: null,
  // Android 화면이 꺼져 있는 동안 페이지 작업을 시작하지 않습니다.
  suspended: document.hidden,
  viewportSize: null,
  resumeSyncTimer: null,
  resumeLayoutTimer: null,
  hiddenAt: document.hidden ? Date.now() : 0,
  lastResumeAt: 0,
  resumeStabilizeUntil: 0,
  epubLocationTask: null,
  gestureResetters: new Set(),
  animationFrameWaiters: new Set()
};

function isMobileReadingLayout() {
  return window.matchMedia('(max-width: 800px)').matches;
}

function isMobileTxtBook() {
  return !!selectedBook &&
    selectedBook.name.toLowerCase().endsWith('.txt');
}

function isMobilePagedReading() {
  return isMobileReadingLayout() &&
    !!selectedBook &&
    document.body.classList.contains('mobile-paged-reading');
}

function isReadingControlTarget(target) {
  const elem = target?.nodeType === 1
    ? target : target?.parentElement;
  return !!elem?.closest?.(
    'a, button, input, select, textarea, summary, [contenteditable="true"]'
  );
}

function initializeMobilePagedReading() {
  if (document.getElementById('mobilePagedReaderStyle')) return;

  const style = document.createElement('style');
  style.id = 'mobilePagedReaderStyle';
  style.textContent = `
    /* 모바일 메뉴는 PC 및 태블릿 너비에서 반드시 숨깁니다. */
    #mobileReaderUi { display:none; }
    @media (min-width:801px) {
      #mobileReaderUi { display:none !important; }
    }
    @media (max-width:800px) {
      body.mobile-paged-reading { overflow:hidden !important; }
      body.mobile-paged-reading .mobile-header,
      body.mobile-paged-reading #txtReader .reader-toolbar,
      body.mobile-paged-reading #epubReader .reader-toolbar,
      body.mobile-paged-reading .open-sidebar-btn { display:none !important; }
      body.mobile-paged-reading #app { height:100dvh !important; }
      body.mobile-paged-reading #readerMain {
        height:100dvh !important;
        width:100% !important;
      }
      body.mobile-paged-reading #txtReader,
      body.mobile-paged-reading #epubReader { height:100% !important; }
      body.mobile-paged-reading #txtScrollArea {
        height:100% !important;
        overflow-x:auto !important;
        overflow-y:hidden !important;
        scroll-behavior:auto !important;
        scrollbar-width:none !important;
        touch-action:none !important;
        overscroll-behavior:contain;
      }
      body.mobile-paged-reading #txtScrollArea::-webkit-scrollbar { display:none !important; }
      body.mobile-paged-reading #txtContent {
        box-sizing:border-box !important;
        margin:0 16px !important;
        width:calc(100vw - 32px) !important;
        min-width:calc(100vw - 32px) !important;
        height:100% !important;
        max-height:100% !important;
        padding:22px 0 36px !important;
        column-width:calc(100vw - 32px) !important;
        column-gap:32px !important;
        column-fill:auto !important;
        white-space:pre-wrap !important;
        overflow-wrap:anywhere !important;
        -webkit-user-select:none !important;
        user-select:none !important;
        -webkit-touch-callout:none !important;
      }
      body.mobile-paged-reading #epubViewer {
        min-height:0 !important;
        height:100% !important;
        touch-action:none !important;
      }
      #mobileReaderUi {
        display:none;
        position:fixed;
        inset:0;
        z-index:2000;
        pointer-events:none;
        font-family:Arial, 'Noto Sans KR', 'Noto Sans SC', sans-serif;
      }
      body.mobile-paged-reading #mobileReaderUi { display:block; }
      #mobileReaderUi .mobile-reader-top,
      #mobileReaderUi .mobile-reader-bottom {
        position:absolute;
        left:0; right:0;
        background:var(--mobile-menu-bg,#efe0c3);
        color:var(--mobile-menu-fg,#332c27);
        box-shadow:0 2px 15px rgba(0,0,0,.16);
        pointer-events:auto;
        transition:transform .16s ease, opacity .16s ease;
      }
      #mobileReaderUi .mobile-reader-top {
        top:0;
        padding:calc(env(safe-area-inset-top, 0px) + 8px) 12px 10px;
        display:flex;
        align-items:center;
        gap:10px;
        min-height:58px;
      }
      #mobileReaderUi .mobile-reader-top-title {
        flex:1;
        min-width:0;
        white-space:nowrap;
        text-overflow:ellipsis;
        overflow:hidden;
        text-align:center;
        font-size:15px;
      }
      #mobileReaderUi .mobile-reader-bottom {
        bottom:0;
        padding:14px 12px calc(env(safe-area-inset-bottom, 0px) + 16px);
        display:flex;
        flex-direction:column;
        gap:12px;
      }
      body.mobile-paged-reading:not(.mobile-paged-controls-visible) #mobileReaderUi .mobile-reader-top {
        transform:translateY(-110%);
        opacity:0;
        pointer-events:none;
      }
      body.mobile-paged-reading:not(.mobile-paged-controls-visible) #mobileReaderUi .mobile-reader-bottom {
        transform:translateY(110%);
        opacity:0;
        pointer-events:none;
      }
      #mobileReaderUi button {
        border:0; border-radius:8px;
        background:rgba(255,255,255,.24);
        color:inherit;
        padding:9px 12px;
        font-size:14px;
        cursor:pointer;
        touch-action:manipulation;
      }
      #mobileReaderUi button:disabled { opacity:.4; }
      #mobileReaderUi .mobile-reader-progress-text {
        text-align:center;
        font-size:13px;
        opacity:.9;
        font-variant-numeric:tabular-nums;
      }
      #mobileReaderUi .mobile-reader-progress-row { display:flex; align-items:center; gap:10px; }
      #mobileReaderUi .mobile-reader-progress-row input {
        min-width:0; flex:1; width:100%;
        accent-color:#a35448;
        touch-action:pan-x;
      }
      #mobileReaderUi .mobile-reader-chapter-row { display:flex; gap:10px; }
      #mobileReaderUi .mobile-reader-chapter-row button { flex:1; }
      #mobileReaderUi .mobile-reader-actions { display:flex; gap:8px; justify-content:space-around; }
      #mobileReaderUi .mobile-reader-actions button { flex:1; }
      body.theme-dark #mobileReaderUi { --mobile-menu-bg:#252525; --mobile-menu-fg:#ededed; }
      body.theme-light #mobileReaderUi { --mobile-menu-bg:#f3f3f3; --mobile-menu-fg:#222; }
      body.theme-green #mobileReaderUi { --mobile-menu-bg:#bdd9bd; --mobile-menu-fg:#263a2b; }
      body.theme-sepia #mobileReaderUi { --mobile-menu-bg:#efe0c3; --mobile-menu-fg:#3f3125; }
    }
  `;
  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.id = 'mobileReaderUi';
  ui.dataset.readerVersion = 'v14.1-mobile-ui-only';
  ui.setAttribute('aria-label', '휴대폰 독서 메뉴');
  ui.innerHTML = `
    <div class="mobile-reader-top">
      <button id="mReaderLibraryBtn" type="button" aria-label="내 서재">☰</button>
      <div class="mobile-reader-top-title" id="mReaderTitle"></div>
      <button id="mReaderCloseBtn" type="button" aria-label="메뉴 닫기">✕</button>
    </div>
    <div class="mobile-reader-bottom">
      <div class="mobile-reader-progress-text" id="mReaderProgressText">위치 불러오는 중...</div>
      <div class="mobile-reader-progress-row">
        <input id="mReaderProgressSlider" type="range" min="0" max="1000" step="1" value="0" aria-label="책 전체 읽기 위치 이동" />
        <span id="mReaderPercent">0%</span>
      </div>
      <div class="mobile-reader-chapter-row">
        <button id="mReaderPrevChapter" type="button">← 이전 장</button>
        <button id="mReaderNextChapter" type="button">다음 장 →</button>
      </div>
      <div class="mobile-reader-actions">
        <button id="mReaderToc" type="button">☷ 목차</button>
        <button id="mReaderOfflineSave" type="button">↓ 오프라인 저장</button>
        <button id="mReaderSettings" type="button">⚙ 설정</button>
      </div>
    </div>
  `;
  document.body.appendChild(ui);
  mobilePageState.controls = ui;
  mobilePageState.slider = ui.querySelector('#mReaderProgressSlider');
  mobilePageState.progressLabel = ui.querySelector('#mReaderProgressText');
  mobilePageState.subtitle = ui.querySelector('#mReaderPercent');

  ui.querySelector('#mReaderLibraryBtn').addEventListener('click', () => {
    setMobileReadingControlsVisible(false);
    if (isMobileReaderDevice()) showMobileBookshelf();
    else {
      sidebar.classList.add('open');
      overlay.classList.remove('hidden');
    }
  });
  ui.querySelector('#mReaderCloseBtn').addEventListener('click', () =>
    setMobileReadingControlsVisible(false));
  ui.querySelector('#mReaderToc').addEventListener('click', () => {
    setMobileReadingControlsVisible(false);
    sidebar.classList.add('open');
    overlay.classList.remove('hidden');
    tocSection.scrollIntoView({block:'start'});
  });
  ui.querySelector('#mReaderSettings').addEventListener('click', () => {
    setMobileReadingControlsVisible(false);
    openSettings();
  });
  ui.querySelector('#mReaderOfflineSave').addEventListener('click',
    saveCurrentBookOffline);
  ui.querySelector('#mReaderPrevChapter').addEventListener('click', () => moveMobileChapter(-1));
  ui.querySelector('#mReaderNextChapter').addEventListener('click', () => moveMobileChapter(1));

  mobilePageState.slider.addEventListener('pointerdown', () => {
    mobilePageState.sliderDragging = true;
  });
  mobilePageState.slider.addEventListener('pointerup', () => {
    mobilePageState.sliderDragging = false;
  });
  mobilePageState.slider.addEventListener('pointercancel', () => {
    mobilePageState.sliderDragging = false;
  });
  mobilePageState.slider.addEventListener('change', () => {
    mobilePageState.sliderDragging = false;
    seekMobileBookProgress(Number(mobilePageState.slider.value) / 1000);
  });

  // 화면을 최대한 넓게 쓰고 싶은 사용자는 설정에서 전체화면을 선택할 수 있습니다.
  // 기기/브라우저에 따라 Android 시스템 버튼은 남을 수 있습니다.
  if (isMobileReaderDevice() && settingsPanel &&
      !document.getElementById('mobileReaderFullscreenBtn')) {
    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.id = 'mobileReaderFullscreenBtn';
    fullBtn.textContent = '⛶ 휴대폰 전체화면 켜기 / 끄기';
    Object.assign(fullBtn.style, {
      width:'100%', padding:'12px', marginTop:'10px',
      borderRadius:'8px', border:'1px solid #aaa',
      background:'transparent', color:'inherit', fontSize:'14px'
    });
    fullBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen({navigationUI:'hide'});
        closeSettings();
      } catch (error) {
        alert('이 브라우저에서는 전체화면 실행이 제한되어 있습니다. 앱을 홈 화면에서 실행해 주세요.');
      }
    });
    settingsPanel.appendChild(fullBtn);
  }

  bindMobilePageGestures(txtScrollArea, document);
  window.addEventListener('resize', () => {
    // Android에서 잠금 해제 시 주소창/내비게이션 바의 resize 이벤트가
    // 연속 발생할 수 있습니다. 실제 크기가 달라진 경우에만 재계산합니다.
    scheduleMobileViewportRefresh();
  });
}

function prepareMobilePagedBook() {
  cancelMobileTransientEffects();
  mobilePageState.viewportSize = null;
  initializeMobilePagedReading();
  document.body.classList.toggle('mobile-paged-reading', isMobileReadingLayout());
  setMobileReadingControlsVisible(false);
  mobilePageState.epubLocationsReady = false;
  mobilePageState.epubLocationBook = null;
  mobilePageState.epubLocation = null;
}

function setMobileReadingControlsVisible(visible) {
  mobilePageState.controlsVisible = !!visible;
  document.body.classList.toggle('mobile-paged-controls-visible',
    !!visible && isMobilePagedReading());
  if (visible) {
    updateMobileProgressDisplay();
    updateOfflineSaveButtons();
  }
}

function toggleMobileReadingControls() {
  if (!isMobilePagedReading() || disguiseMode) return;
  setMobileReadingControlsVisible(!mobilePageState.controlsVisible);
}

function getMobileTxtPageStride() {
  return Math.max(1, txtScrollArea.clientWidth);
}

function getMobileTxtPageCount() {
  const stride = getMobileTxtPageStride();
  const scrollWidth = Math.max(txtScrollArea.scrollWidth, txtContent.scrollWidth);
  const max = Math.max(0, scrollWidth - txtScrollArea.clientWidth);
  return Math.max(1, Math.round(max / stride) + 1);
}

function finishMobileTxtRender(ratio = 0) {
  if (isVirtualMobileTxt()) {
    void activateVirtualTxtChapter(ratio);
    return;
  }
  if (!isMobilePagedReading() || !isMobileTxtBook()) return;
  const pageCount = getMobileTxtPageCount();
  mobilePageState.txtPages = pageCount;
  mobilePageState.txtPageIndex = Math.min(pageCount - 1,
    Math.max(0, Math.round(ratio * (pageCount - 1))));
  txtScrollArea.scrollLeft = mobilePageState.txtPageIndex * getMobileTxtPageStride();
  txtScrollArea.scrollTop = 0;
  mobilePageState.viewportSize = readMobileViewportSize();
  updateMobileProgressDisplay();
}

function rememberMobileTxtProgress() {
  if (isVirtualMobileTxt()) {
    saveVirtualMobileTxtProgress();
    return;
  }
  if (!isMobilePagedReading() || !isMobileTxtBook()) return;
  const ratio = mobilePageState.txtPages <= 1 ? 0 :
    mobilePageState.txtPageIndex / (mobilePageState.txtPages - 1);
  readerState.txtProgress[selectedBook.id] = {
    chapterIndex:currentTxtChapter,
    scrollRatio:ratio,
    pageRatio:ratio
  };
  scheduleStateSave();
}

function buildMobileTxtLengthIndex() {
  let total = 0;
  mobilePageState.chapterPrefix = [0];
  for (const chapter of txtChapters) {
    total += Math.max(1, chapter.content.length);
    mobilePageState.chapterPrefix.push(total);
  }
  mobilePageState.totalChars = Math.max(1, total);
}

function getMobileBookPercent() {
  if (isMobileTxtBook()) {
    if (isVirtualMobileTxt()) {
      const chapterStart = mobilePageState.chapterPrefix[currentTxtChapter] || 0;
      const offset = virtualTxtCurrentOffset();
      return Math.max(0, Math.min(1,
        (chapterStart + offset) / mobilePageState.totalChars));
    }
    const start = mobilePageState.chapterPrefix[currentTxtChapter] || 0;
    const len = Math.max(1, txtChapters[currentTxtChapter]?.content?.length || 1);
    const r = mobilePageState.txtPages <= 1 ? 0 :
      mobilePageState.txtPageIndex / (mobilePageState.txtPages - 1);
    return Math.min(1, (start + r * len) / mobilePageState.totalChars);
  }
  const loc = mobilePageState.epubLocation;
  const cfi = loc?.start?.cfi;
  if (mobilePageState.epubLocationsReady && cfi) {
    const p = mobilePageState.epubLocationBook?.locations?.percentageFromCfi(cfi);
    if (Number.isFinite(p)) return Math.min(1, Math.max(0, p));
  }
  const spineLen = epubBook?.spine?.length || epubBook?.spine?.items?.length || 1;
  const spineIndex = loc?.start?.index || 0;
  const local = loc?.start?.displayed;
  const localP = local?.total ? (Math.max(0, local.page - 1) / local.total) : 0;
  return Math.max(0, Math.min(1, (spineIndex + localP) / spineLen));
}

function updateMobileProgressDisplay() {
  if (!isMobilePagedReading() || !mobilePageState.controls) return;
  const percent = getMobileBookPercent();
  if (!mobilePageState.sliderDragging) {
    mobilePageState.slider.value = String(Math.round(percent * 1000));
  }
  mobilePageState.subtitle.textContent = `${Math.round(percent * 100)}%`;
  mobilePageState.controls.querySelector('#mReaderTitle').textContent = selectedBook?.name || '';
  let label;
  if (isMobileTxtBook()) {
    if (isVirtualMobileTxt()) {
      const layout = virtualTxtActive;
      const pages = layout?.complete
        ? String(layout.boundaries.length - 1)
        : `약 ${virtualTxtApproximatePageCount(layout)}`;
      label = `${currentTxtChapter + 1}/${txtChapters.length}장 · ` +
        `${mobilePageState.txtPageIndex + 1}/${pages}페이지 · 전체 ${Math.round(percent*100)}%`;
    } else {
      label = `${currentTxtChapter + 1}/${txtChapters.length}장 · ` +
        `${mobilePageState.txtPageIndex + 1}/${mobilePageState.txtPages}페이지 · 전체 ${Math.round(percent*100)}%`;
    }
  } else {
    const loc = mobilePageState.epubLocation?.start?.displayed;
    const pageText = loc?.total ? `${loc.page}/${loc.total}페이지` : '페이지 확인 중';
    label = `${pageText} · 전체 ${Math.round(percent * 100)}%`;
  }
  mobilePageState.progressLabel.textContent = label;
  const prev = mobilePageState.controls.querySelector('#mReaderPrevChapter');
  const next = mobilePageState.controls.querySelector('#mReaderNextChapter');
  if (isMobileTxtBook()) {
    prev.disabled = currentTxtChapter <= 0;
    next.disabled = currentTxtChapter >= txtChapters.length - 1;
  } else {
    const current = epubBook?.spine?.get(mobilePageState.epubLocation?.start?.cfi);
    prev.disabled = !current?.prev();
    next.disabled = !current?.next();
  }
}

/* =========================================================
   모바일 종이책 넘김 모션 v6
   실제 TXT의 현재 페이지를 복제하여 3D 종이처럼 접히게 표시합니다.
   EPUB도 책장 면/그림자 효과를 적용합니다.
   운영체제의 '동작 줄이기'가 켜져 있으면 모션을 생략합니다.
========================================================= */
function mobilePageMotionEnabled() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function nextMobileAnimationFrame() {
  if (document.hidden || mobilePageState.suspended) return Promise.resolve();
  return new Promise(resolve => {
    const waiter = {id:0, finish:null};
    waiter.finish = () => {
      mobilePageState.animationFrameWaiters.delete(waiter);
      resolve();
    };
    mobilePageState.animationFrameWaiters.add(waiter);
    waiter.id = requestAnimationFrame(waiter.finish);
  });
}

/* =========================================================
   v8 고속 페이지 미리보기
   거대한 장 전체를 두 번 복제하지 않습니다.
   브라우저가 이미 배치한 글자 위치를 이진 탐색하여
   지금 보이는 페이지만 짧은 텍스트로 렌더링합니다.
========================================================= */
function mobileFastPageBoundary(pageNumber) {
  const node = txtContent.firstChild;
  const count = node?.nodeType === Node.TEXT_NODE ? node.length : 0;
  if (!count || pageNumber <= 0) return 0;
  if (pageNumber >= mobilePageState.txtPages) return count;

  const stride = getMobileTxtPageStride();
  const cssSig = `${stride}:${txtScrollArea.clientHeight}:${getComputedStyle(txtContent).fontSize}:${getComputedStyle(txtContent).lineHeight}`;
  if (mobilePageState.fastBoundaryNode !== node ||
      mobilePageState.fastBoundaryCss !== cssSig) {
    mobilePageState.fastBoundaryNode = node;
    mobilePageState.fastBoundaryCss = cssSig;
    mobilePageState.fastBoundaryCache = new Map();
  }
  const cache = mobilePageState.fastBoundaryCache;
  if (cache.has(pageNumber)) return cache.get(pageNumber);

  // Range 위치는 이미 렌더링된 원본에서 읽으므로 재복제/재배치가 필요 없습니다.
  const range = document.createRange();
  const viewLeft = txtScrollArea.getBoundingClientRect().left;
  const threshold = pageNumber * stride - 1;
  let low = 0, high = count;
  while (low < high) {
    const mid = (low + high) >>> 1;
    range.setStart(node, mid);
    range.setEnd(node, Math.min(count, mid + 1));
    const x = range.getBoundingClientRect().left + txtScrollArea.scrollLeft - viewLeft;
    if (x >= threshold) high = mid;
    else low = mid + 1;
  }
  range.detach?.();
  cache.set(pageNumber, low);
  return low;
}

function mobileFastPreviewText(pageIndex, chapterDelta = 0) {
  if (isVirtualMobileTxt() && !chapterDelta) {
    virtualTxtEnsurePage(pageIndex);
    const boundaries = virtualTxtActive?.boundaries;
    const chapter = txtChapters[currentTxtChapter]?.content || '';
    const a = boundaries?.[pageIndex] ?? 0;
    const b = boundaries?.[pageIndex + 1] ?? a;
    return chapter.slice(a, b);
  }
  if (!chapterDelta) {
    const start = mobileFastPageBoundary(pageIndex);
    const end = mobileFastPageBoundary(pageIndex + 1);
    return (txtContent.textContent || '').slice(start, Math.max(start, end));
  }
  const chapter = txtChapters[currentTxtChapter + chapterDelta];
  const content = chapter?.content || '';
  // 장을 넘기는 경계에만 쓰는 가벼운 미리보기(본문 전체 복제 없음).
  return chapterDelta > 0 ? content.slice(0, 550) : content.slice(-550);
}

function mobileFastPreviewFace(pageIndex, chapterDelta, width) {
  const face = document.createElement('div');
  const css = getComputedStyle(txtContent);
  const background = getComputedStyle(document.body).backgroundColor;
  const innerWidth = Math.max(1, width - 32);
  Object.assign(face.style, {
    position:'absolute', inset:'0', overflow:'hidden',
    background, pointerEvents:'none', contain:'paint'
  });
  const content = document.createElement('div');
  const props = [
    'font-family','font-size','font-weight','font-style',
    'line-height','letter-spacing','color','white-space',
    'word-break','overflow-wrap','text-align','text-indent'
  ];
  for (const name of props) content.style.setProperty(name, css.getPropertyValue(name));
  Object.assign(content.style, {
    width:`${innerWidth}px`, minWidth:`${innerWidth}px`,
    height:'100%', maxHeight:'100%', boxSizing:'border-box',
    margin:'0 16px', padding:'22px 0 36px',
    columnCount:'auto', columnWidth:'auto', columnGap:'normal',
    whiteSpace:'pre-wrap', overflowWrap:'anywhere'
  });
  content.textContent = mobileFastPreviewText(pageIndex, chapterDelta);
  face.appendChild(content);
  return face;
}

function makeMobilePageFlipSnapshot(direction, kind) {
  if (!isMobilePagedReading() || !mobilePageMotionEnabled()) return null;
  const source = kind === 'txt' ? txtScrollArea : epubViewer;
  if (!source) return null;
  const rect = source.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return null;

  const surfaceColor = getComputedStyle(document.body).backgroundColor;
  const stage = document.createElement('div');
  stage.className = 'mobile-paper-flip-stage';
  Object.assign(stage.style, {
    position:'fixed', left:`${rect.left}px`, top:`${rect.top}px`,
    width:`${rect.width}px`, height:`${rect.height}px`,
    pointerEvents:'none', perspective:'1150px',
    overflow:'visible', zIndex:'1900', isolation:'isolate'
  });

  const paper = document.createElement('div');
  paper.className = 'mobile-paper-flip-sheet';
  Object.assign(paper.style, {
    position:'absolute', inset:'0', width:'100%', height:'100%',
    background:surfaceColor, overflow:'hidden',
    transformOrigin: direction > 0 ? 'left center' : 'right center',
    transformStyle:'preserve-3d', backfaceVisibility:'hidden',
    boxShadow:direction > 0 ? '8px 0 24px rgba(0,0,0,.16)' : '-8px 0 24px rgba(0,0,0,.16)',
    borderRadius:direction > 0 ? '0 7px 7px 0' : '7px 0 0 7px'
  });

  if (kind === 'txt') {
    // 한 페이지에 필요한 글자만 복사하므로 긴 장도 가볍습니다.
    paper.appendChild(mobileFastPreviewFace(
      mobilePageState.txtPageIndex, 0, rect.width));
  } else {
    // EPUB의 iframe 원본을 복제할 수 없으므로 종이면/그림자 효과만 적용.
    const paperShimmer = document.createElement('div');
    Object.assign(paperShimmer.style, {
      position:'absolute',inset:'0', background:
      'linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.22) 85%,rgba(0,0,0,.04))'
    });
    paper.appendChild(paperShimmer);
  }

  const shade = document.createElement('div');
  Object.assign(shade.style, {
    position:'absolute', inset:'0', pointerEvents:'none',
    background:direction > 0 ?
      'linear-gradient(to right,transparent 62%,rgba(0,0,0,.25))' :
      'linear-gradient(to left,transparent 62%,rgba(0,0,0,.25))',
    opacity:'0', zIndex:'2'
  });
  paper.appendChild(shade);
  stage.appendChild(paper);

  // v11: 일반 독서 화면의 밝기 오버레이(z-index:9)보다
  // 페이지 넘김 레이어(z-index:1900)가 앞에 그려집니다.
  // 전환 중인 앞/뒤 종이도 같은 밝기로 보이도록 별도 어둡기 레이어를 추가합니다.
  // stage에 고정하고 종이 자체에는 붙이지 않아서 드래그 시 밝기가 변하지 않습니다.
  const flipDimmer = document.createElement('div');
  flipDimmer.className = 'mobile-paper-flip-dimmer';
  Object.assign(flipDimmer.style, {
    position:'absolute', inset:'0',
    background:'#000',
    opacity:String((100 - Math.max(20, Math.min(100,
      Number(readerState.settings.brightness ?? 100)))) / 120),
    pointerEvents:'none', zIndex:'5'
  });
  stage.appendChild(flipDimmer);

  document.body.appendChild(stage);
  stage._paper = paper;
  stage._shade = shade;
  stage._copyScroll?.();
  return stage;
}

async function animateMobilePageFlip(direction, kind, performTurn) {
  if (document.hidden || mobilePageState.suspended || !mobilePageMotionEnabled()) {
    await performTurn();
    return;
  }
  const snapshot = makeMobilePageFlipSnapshot(direction, kind);
  if (!snapshot) {
    await performTurn();
    return;
  }
  try {
    await performTurn();
    await nextMobileAnimationFrame();
    // 화면 잠금 중 취소된 애니메이션을 복귀 시 다시 시작하지 않습니다.
    if (document.hidden || mobilePageState.suspended || !snapshot.isConnected) return;
    const angle = direction > 0 ? -105 : 105;
    const animation = snapshot._paper.animate([
      {transform:'rotateY(0deg) scaleX(1)', filter:'brightness(1)', offset:0},
      {transform:`rotateY(${angle*.22}deg) scaleX(.985)`, filter:'brightness(.97)', offset:.28},
      {transform:`rotateY(${angle*.65}deg) scaleX(.94)`, filter:'brightness(.85)', offset:.72},
      {transform:`rotateY(${angle}deg) scaleX(.95)`, filter:'brightness(.78)', offset:1}
    ], {duration:480, easing:'cubic-bezier(.25,.65,.18,1)', fill:'forwards'});
    const shading = snapshot._shade.animate([
      {opacity:0}, {opacity:.95,offset:.65}, {opacity:.55}
    ], {duration:480, easing:'ease-in-out', fill:'forwards'});
    await animation.finished.catch(() => {});
    shading.cancel();
  } finally {
    snapshot.remove();
  }
}

async function animateMobileTxtChapter(direction, targetIndex, ratio = 0) {
  if (mobilePageState.pageTurning || targetIndex < 0 ||
      targetIndex >= txtChapters.length) return;
  mobilePageState.pageTurning = true;
  try {
    await animateMobilePageFlip(direction, 'txt', async () => {
      await moveTxtChapter(targetIndex, ratio);
      await nextMobileAnimationFrame();
      await nextMobileAnimationFrame();
      await nextMobileAnimationFrame();
    });
  } finally {
    mobilePageState.pageTurning = false;
    updateMobileProgressDisplay();
  }
}

async function turnMobileTxtPage(direction) {
  if (isVirtualMobileTxt()) {
    if (mobilePageState.pageTurning) return;
    mobilePageState.pageTurning = true;
    try {
      await animateMobilePageFlip(direction, 'txt', () =>
        virtualTxtCommitPage(direction));
    } finally { mobilePageState.pageTurning = false; }
    return;
  }
  if (!isMobilePagedReading() || !isMobileTxtBook() ||
      mobilePageState.pageTurning) return;
  if (direction > 0 && mobilePageState.txtPageIndex >= mobilePageState.txtPages - 1)
    return animateMobileTxtChapter(1, currentTxtChapter + 1);
  if (direction < 0 && mobilePageState.txtPageIndex <= 0)
    return animateMobileTxtChapter(-1, currentTxtChapter - 1, 1);

  mobilePageState.pageTurning = true;
  try {
    const index = Math.max(0, Math.min(mobilePageState.txtPages - 1,
      mobilePageState.txtPageIndex + direction));
    const newLeft = index * getMobileTxtPageStride();
    await animateMobilePageFlip(direction, 'txt', () => {
      txtScrollArea.scrollLeft = newLeft;
      mobilePageState.txtPageIndex = index;
      rememberMobileTxtProgress();
      updateMobileProgressDisplay();
    });
  } finally {
    mobilePageState.pageTurning = false;
  }
}

async function turnMobileEpubPage(direction) {
  if (!epubRendition || mobilePageState.pageTurning) return;
  mobilePageState.pageTurning = true;
  try {
    const rendition = epubRendition;
    await animateMobilePageFlip(direction, 'epub', async () => {
      if (rendition === epubRendition) {
        if (direction > 0) await rendition.next();
        else await rendition.prev();
      }
    });
  } catch (error) {
    console.warn('EPUB 페이지 전환 실패', error);
  } finally {
    mobilePageState.pageTurning = false;
    updateMobileProgressDisplay();
  }
}

function turnMobilePage(direction) {
  if (document.hidden || mobilePageState.suspended ||
      !isMobilePagedReading() || mobilePageState.pageTurning) return;
  if (!mobileDragCanMove(direction)) return;

  // 짧은 터치도 드래그와 완전히 동일한 페이지 무대와
  // 다음 페이지 미리보기를 사용하여 움직입니다.
  // 손가락 이동량만 0으로 시작하고 끝까지 자동으로 넘깁니다.
  if (mobilePageMotionEnabled()) {
    const gesture = {
      direction,
      dx: 0,
      dragging: false,
      finishing: false,
      frameId: 0
    };
    if (beginMobilePageDrag(gesture, direction)) {
      // 드래그와 같은 finish 함수를 이용하므로
      // 3D 슬라이드, 뒤쪽 페이지 노출, 그림자 및 저장을 공유합니다.
      void finishMobilePageDrag(gesture, true);
      return;
    }
  }

  // 모션 줄이기 설정이나 저사양 브라우저에서는 기존 전환을 유지합니다.
  if (isMobileTxtBook()) {
    void turnMobileTxtPage(direction);
  } else {
    void turnMobileEpubPage(direction);
  }
}

async function moveMobileChapter(direction) {
  if (!isMobilePagedReading() || mobilePageState.pageTurning) return;
  if (isMobileTxtBook()) {
    await animateMobileTxtChapter(direction, currentTxtChapter + direction);
    return;
  }
  const current = epubBook?.spine?.get(mobilePageState.epubLocation?.start?.cfi);
  const dest = direction > 0 ? current?.next() : current?.prev();
  if (!dest || !epubRendition) return;
  mobilePageState.pageTurning = true;
  try {
    await animateMobilePageFlip(direction, 'epub', () =>
      epubRendition.display(dest.href || dest.idref));
  } catch (error) {
    console.warn('EPUB 장 이동 실패', error);
  } finally {
    mobilePageState.pageTurning = false;
    updateMobileProgressDisplay();
  }
}

async function seekMobileBookProgress(p) {
  if (!isMobilePagedReading()) return;
  const target = Math.max(0, Math.min(0.999999, p));
  if (isMobileTxtBook()) {
    const chars = target * mobilePageState.totalChars;
    let low = 0;
    let high = txtChapters.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (mobilePageState.chapterPrefix[mid + 1] <= chars) low = mid + 1;
      else high = mid;
    }
    const length = Math.max(1, txtChapters[low]?.content?.length || 1);
    const within = Math.max(0, Math.min(1,
      (chars - mobilePageState.chapterPrefix[low]) / length));
    if (low !== currentTxtChapter) await moveTxtChapter(low, within);
    else if (isVirtualMobileTxt()) {
      void virtualTxtSeekRatio(within);
    } else {
      finishMobileTxtRender(within);
      rememberMobileTxtProgress();
    }
  } else {
    try {
      const locations = epubBook?.locations;
      if (!mobilePageState.epubLocationsReady || !locations) {
        mobilePageState.progressLabel.textContent = 'EPUB 위치 계산 중...';
        const ready = await ensureMobileEpubLocations(epubBook);
        if (!ready || !isMobilePagedReading()) return;
      }
      const cfi = locations.cfiFromPercentage(target);
      if (cfi) await epubRendition?.display(cfi);
    } catch (error) {
      console.warn('EPUB 이동 실패', error);
    }
  }
  updateMobileProgressDisplay();
}

/* =========================================================
   v7 손가락 따라 움직이는 휴대폰 페이지 드래그
   - 손가락 이동거리 만큼 현재 페이지 이동
   - TXT는 이동 중 다음/이전 페이지를 실제로 미리 표시
   - 짧게 밀면 복원 / 충분히 밀면 다음 페이지 확정
   - EPUB은 iframe 특성상 페이지 전환을 놓는 순간 확정
========================================================= */

function mobileDragCanMove(direction) {
  if (isVirtualMobileTxt()) {
    if (!virtualTxtActive || virtualTxtActive.bookId !== selectedBook?.id ||
        virtualTxtActive.chapterIndex !== currentTxtChapter) return false;
    if (direction > 0) {
      virtualTxtEnsurePage(mobilePageState.txtPageIndex + 1);
      return mobilePageState.txtPageIndex < virtualTxtKnownPageCount() - 1 ||
        currentTxtChapter < txtChapters.length - 1;
    }
    return mobilePageState.txtPageIndex > 0 || currentTxtChapter > 0;
  }
  if (isMobileTxtBook()) {
    if (direction > 0) {
      return mobilePageState.txtPageIndex < mobilePageState.txtPages - 1 ||
        currentTxtChapter < txtChapters.length - 1;
    }
    return mobilePageState.txtPageIndex > 0 || currentTxtChapter > 0;
  }
  if (!epubRendition) return false;
  // EPUB은 마지막 페이지 여부가 항상 즉시 알려지지 않으므로
  // 실제 next()/prev() 실행 결과를 최종적으로 확인합니다.
  return true;
}

function mobileDragPlacePaper(drag, delta, immediate = false) {
  if (!drag?.stage || !drag.stage.isConnected) return;
  const width = Math.max(1, drag.width);
  const dx = drag.direction > 0
    ? Math.max(-width, Math.min(0, delta))
    : Math.min(width, Math.max(0, delta));
  drag.dx = dx;
  drag.pendingDx = dx;

  // pointermove가 60~120회/초 발생해도 화면 갱신은 프레임당 최대 한 번.
  const paint = () => {
    drag.frameId = 0;
    if (!drag.stage?.isConnected || drag.finishing) return;
    const x = drag.pendingDx;
    const fraction = Math.min(1, Math.abs(x) / width);
    const angle = drag.direction > 0 ? -5 * fraction : 5 * fraction;
    drag.paper.style.transform = `translate3d(${x}px,0,0) rotateY(${angle}deg)`;
    if (drag.back) {
      const backX = drag.direction > 0 ? width + x : -width + x;
      drag.back.style.transform = `translate3d(${backX}px,0,0)`;
    }
    // 매 프레임 box-shadow/filter를 바꾸면 모바일 GPU가 느려집니다.
    if (drag.shade) drag.shade.style.opacity = String(.15 + fraction * .35);
  };
  if (immediate) {
    if (drag.frameId) cancelAnimationFrame(drag.frameId);
    paint();
  } else if (!drag.frameId) {
    drag.frameId = requestAnimationFrame(paint);
  }
}

function mobileDragBuildStage(direction) {
  const kind = isMobileTxtBook() ? 'txt' : 'epub';
  const stage = makeMobilePageFlipSnapshot(direction, kind);
  if (!stage) return null;
  stage.style.overflow = 'hidden';
  // 평면 GPU 이동에 약한 3D 기울임만 남겨 메모리와 합성 비용을 최소화합니다.
  stage.style.perspective = '1600px';
  const paper = stage._paper;
  paper.style.transformOrigin = 'center center';
  paper.style.willChange = 'transform';
  paper.style.borderRadius = '0';
  paper.style.boxShadow = direction > 0
    ? '7px 0 16px rgba(0,0,0,.14)'
    : '-7px 0 16px rgba(0,0,0,.14)';

  // 무거운 전체 장 복제가 아닌 한 페이지만 별도로 구성합니다.
  const back = document.createElement('div');
  back.className = 'mobile-paper-drag-next';
  Object.assign(back.style, {
    position:'absolute', inset:'0', width:'100%', height:'100%',
    zIndex:'0', boxShadow:'none', borderRadius:'0',
    background:getComputedStyle(document.body).backgroundColor,
    transform:`translate3d(${direction > 0 ? '100%' : '-100%'},0,0)`,
    willChange:'transform', backfaceVisibility:'hidden',
    pointerEvents:'none', overflow:'hidden'
  });
  if (kind === 'txt') {
    let neighbor = mobilePageState.txtPageIndex + direction;
    let chapterDelta = 0;
    if (neighbor >= mobilePageState.txtPages) {
      chapterDelta = 1;
      neighbor = 0;
    } else if (neighbor < 0) {
      chapterDelta = -1;
      neighbor = 0;
    }
    back.appendChild(mobileFastPreviewFace(neighbor, chapterDelta,
      stage.getBoundingClientRect().width));
  } else {
    // iframe 내용을 통째로 복사할 수 없는 EPUB은 가벼운 종이면만 표시.
    const tint = document.createElement('div');
    Object.assign(tint.style, {
      position:'absolute', inset:'0',
      background:'linear-gradient(90deg,rgba(255,255,255,.08),transparent)'
    });
    back.appendChild(tint);
  }
  paper.style.zIndex = '1';
  stage.insertBefore(back, paper);
  return {stage, paper, shade:stage._shade, back};
}

function beginMobilePageDrag(gesture, direction) {
  if (document.hidden || mobilePageState.suspended ||
      mobilePageState.pageTurning || !mobileDragCanMove(direction)) return false;
  const built = mobileDragBuildStage(direction);
  if (!built) return false;
  mobilePageState.pageTurning = true;
  mobilePageState.activeDrag = gesture;
  gesture.direction = direction;
  gesture.stage = built.stage;
  gesture.paper = built.paper;
  gesture.shade = built.shade;
  gesture.back = built.back;
  gesture.width = built.stage.getBoundingClientRect().width || window.innerWidth;
  gesture.dragging = true;
  setMobileReadingControlsVisible(false);
  mobileDragPlacePaper(gesture, 0, true);
  return true;
}

async function mobileDragCommitPage(direction) {
  if (!isMobilePagedReading()) return;
  if (isVirtualMobileTxt()) {
    await virtualTxtCommitPage(direction);
    return;
  }
  if (isMobileTxtBook()) {
    let nextIndex = mobilePageState.txtPageIndex + direction;
    if (nextIndex >= 0 && nextIndex < mobilePageState.txtPages) {
      mobilePageState.txtPageIndex = nextIndex;
      txtScrollArea.scrollLeft = nextIndex * getMobileTxtPageStride();
      rememberMobileTxtProgress();
      updateMobileProgressDisplay();
    } else if (direction > 0 && currentTxtChapter < txtChapters.length - 1) {
      await moveTxtChapter(currentTxtChapter + 1, 0);
      await nextMobileAnimationFrame();
      await nextMobileAnimationFrame();
    } else if (direction < 0 && currentTxtChapter > 0) {
      await moveTxtChapter(currentTxtChapter - 1, 1);
      await nextMobileAnimationFrame();
      await nextMobileAnimationFrame();
    }
  } else if (epubRendition) {
    const rendition = epubRendition;
    if (direction > 0) await rendition.next();
    else await rendition.prev();
    updateMobileProgressDisplay();
  }
}

async function finishMobilePageDrag(gesture, commit) {
  if (!gesture?.dragging || gesture.finishing) return;
  // 마지막 예약 프레임이 이동 완료 애니메이션과 충돌하지 않게 취소.
  if (gesture.frameId) cancelAnimationFrame(gesture.frameId);
  gesture.frameId = 0;
  gesture.finishing = true;
  const dir = gesture.direction;
  const finalX = commit ? -dir * gesture.width : 0;
  const startX = gesture.dx || 0;
  const fraction = Math.abs(finalX - startX) / Math.max(1, gesture.width);
  const duration = mobilePageMotionEnabled()
    ? Math.max(110, Math.round(280*fraction)) : 0;
  try {
    if (commit) {
      // 아래 페이지를 먼저 갱신하여 현재 종이가 옆으로 밀리면
      // 새 페이지가 보이게 합니다.
      const turning = mobileDragCommitPage(dir).catch(error => {
        console.warn('드래그 페이지 이동 실패', error);
      });
      if (duration) {
        const backEndX = 0;
        const backingAnimation = gesture.back?.animate([
          {transform:gesture.back.style.transform},
          {transform:`translate3d(${backEndX}px,0,0)`}
        ], {duration,easing:'cubic-bezier(.22,.65,.2,1)',fill:'forwards'});
        const animation = gesture.paper.animate([
          {transform:gesture.paper.style.transform, offset:0},
          {transform:`translate3d(${finalX}px,0,0) rotateY(${dir > 0 ? -5 : 5}deg)`,offset:1}
        ], {duration, easing:'cubic-bezier(.22,.65,.2,1)', fill:'forwards'});
        await Promise.all([
          animation.finished.catch(() => {}),
          backingAnimation?.finished.catch(() => {}),
          turning
        ]);
      } else {
        await turning;
      }
    } else if (duration && Math.abs(startX) > 1) {
      const backEndX = dir > 0 ? gesture.width : -gesture.width;
      const backingAnimation = gesture.back?.animate([
        {transform:gesture.back.style.transform},
        {transform:`translate3d(${backEndX}px,0,0)`}
      ], {duration,easing:'ease-out',fill:'forwards'});
      const animation = gesture.paper.animate([
        {transform:gesture.paper.style.transform},
        {transform:'translate3d(0px,0,0) rotateY(0deg)'}
      ], {duration,easing:'ease-out',fill:'forwards'});
      await Promise.all([
        animation.finished.catch(() => {}),
        backingAnimation?.finished.catch(() => {})
      ]);
    }
  } finally {
    gesture.stage?.remove();
    if (mobilePageState.activeDrag === gesture) {
      mobilePageState.activeDrag = null;
      mobilePageState.pageTurning = false;
    }
    if (!document.hidden && !mobilePageState.suspended) updateMobileProgressDisplay();
  }
}

function bindMobilePageGestures(target, ownerDocument) {
  if (!target || target.__mobilePageGesturesBound) return;
  target.__mobilePageGesturesBound = true;
  const isEpubDocument = ownerDocument !== document;
  if (isEpubDocument) {
    // 손가락 이동 중 epub iframe의 기본 텍스트 스크롤을 방지합니다.
    ownerDocument.documentElement.style.touchAction = 'none';
    ownerDocument.documentElement.style.userSelect = 'none';
    if (ownerDocument.body) {
      ownerDocument.body.style.touchAction = 'none';
      ownerDocument.body.style.userSelect = 'none';
      ownerDocument.body.style.webkitUserSelect = 'none';
    }
  }
  let gesture = null;
  mobilePageState.gestureResetters.add(() => {
    if (!gesture) return;
    try { target.releasePointerCapture?.(gesture.id); } catch (_) {}
    gesture = null;
  });
  target.addEventListener('pointerdown', event => {
    if (document.hidden || mobilePageState.suspended ||
        !isMobilePagedReading() || mobilePageState.pageTurning ||
        !event.isPrimary || event.button !== 0 ||
        isReadingControlTarget(event.target)) {
      gesture = null; return;
    }
    gesture = {
      id:event.pointerId, x:event.clientX, y:event.clientY,
      t:performance.now(), dx:0, dragging:false, finishing:false
    };
    // 프레임 바깥으로 밀어도 pointerup을 수신할 수 있게 합니다.
    try { event.target.setPointerCapture?.(event.pointerId); } catch (_) {}
  }, {passive:true});

  target.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId ||
        document.hidden || mobilePageState.suspended ||
        !isMobilePagedReading() || gesture.finishing) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragging) {
      if (Math.abs(dx) < 10) return;
      if (Math.abs(dx) < Math.abs(dy)*1.25) return;
      if (!beginMobilePageDrag(gesture, dx < 0 ? 1 : -1)) return;
    }
    if (event.cancelable) event.preventDefault();
    mobileDragPlacePaper(gesture, dx);
  }, {passive:false});

  const onFinish = (event, cancelled=false) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const current = gesture;
    gesture = null;
    if (current.dragging) {
      if (event.cancelable) event.preventDefault();
      const dx = event.clientX - current.x;
      mobileDragPlacePaper(current, dx, true);
      const dt = Math.max(1, performance.now() - current.t);
      const velocity = Math.abs(dx) / dt;
      const distance = Math.abs(current.dx || 0);
      const commit = !cancelled &&
        (distance > current.width*.22 || (distance > 30 && velocity > .6));
      void finishMobilePageDrag(current, commit);
      return;
    }
    if (cancelled || document.hidden || mobilePageState.suspended ||
        !isMobilePagedReading() || mobilePageState.pageTurning)
      return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const time = performance.now() - current.t;
    if (time > 850 || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    if (isReadingControlTarget(event.target)) return;
    const selection = ownerDocument.getSelection?.();
    if (selection && !selection.isCollapsed) return;
    const width = ownerDocument.defaultView?.innerWidth || window.innerWidth;
    const portion = event.clientX / Math.max(1, width);
    if (portion >= .56) turnMobilePage(1);
    else if (portion <= .24) turnMobilePage(-1);
    else toggleMobileReadingControls();
  };
  target.addEventListener('pointerup', event => onFinish(event), {passive:false});
  target.addEventListener('pointercancel', event => onFinish(event,true), {passive:false});
}

/* =========================================================
   v12: Android 화면 잠금 / 복귀 최적화
   잠금 중 렌더링을 중단하고, 돌아올 때 기존 페이지를 먼저 보여줍니다.
========================================================= */

function readMobileViewportSize() {
  const target = isMobileTxtBook() ? txtScrollArea : epubViewer;
  if (!target || !target.isConnected) return null;
  return {width: target.clientWidth, height: target.clientHeight};
}

function mobileViewportReallyChanged(before, after) {
  if (!before || !after) return true;
  // 화면 시스템 바의 미세한 높이 변화로 전체 페이지를 다시 만들지 않음.
  // Android는 잠금 해제 직후 시스템 바 높이를 여러 번 바꿉니다.
  // 너비가 같다면 소규모 높이 변화는 재페이지화하지 않습니다.
  return Math.abs(before.width - after.width) > 3 ||
    Math.abs(before.height - after.height) > 36;
}

function scheduleMobileViewportRefresh(delay = 700) {
  if (!isMobilePagedReading()) return;
  clearTimeout(mobilePageState.resizeTimer);
  if (document.hidden || mobilePageState.suspended) return;
  // 잠금에서 복귀한 직후의 연속 resize 이벤트는 조용해질 때까지 합칩니다.
  const remaining = Math.max(0,
    (mobilePageState.resumeStabilizeUntil || 0) - Date.now());
  mobilePageState.resizeTimer = setTimeout(() => {
    mobilePageState.resizeTimer = null;
    if (document.hidden || mobilePageState.suspended || !isMobilePagedReading()) return;
    const size = readMobileViewportSize();
    if (!size?.width || !size?.height) return;
    if (!mobileViewportReallyChanged(mobilePageState.viewportSize, size)) return;
    if (mobilePageState.pageTurning) {
      scheduleMobileViewportRefresh(650);
      return;
    }
    if (isMobileTxtBook()) {
      if (isVirtualMobileTxt()) {
        void virtualTxtRefreshAfterResize();
        return;
      }
      // 현재 페이지 비율을 보존하면서 딱 한 번만 페이지 수 재계산.
      const ratio = mobilePageState.txtPages <= 1 ? 0 :
        mobilePageState.txtPageIndex / (mobilePageState.txtPages - 1);
      finishMobileTxtRender(ratio);
    } else {
      epubRendition?.resize();
      mobilePageState.viewportSize = readMobileViewportSize();
      updateMobileProgressDisplay();
    }
  }, Math.max(delay, remaining + 250));
}

function cancelMobileTransientEffects() {
  clearTimeout(mobilePageState.resizeTimer);
  mobilePageState.resizeTimer = null;
  for (const reset of mobilePageState.gestureResetters) {
    try { reset(); } catch (_) {}
  }
  const drag = mobilePageState.activeDrag;
  if (drag?.frameId) {
    cancelAnimationFrame(drag.frameId);
    drag.frameId = 0;
  }
  // 애니메이션 취소는 .finished 대기 Promise를 해제합니다.
  document.querySelectorAll('.mobile-paper-flip-stage').forEach(stage => {
    try {
      for (const animation of stage.getAnimations({subtree:true})) {
        animation.cancel();
      }
    } catch (_) {}
    stage.remove();
  });
  for (const waiter of Array.from(mobilePageState.animationFrameWaiters)) {
    cancelAnimationFrame(waiter.id);
    waiter.finish();
  }
  mobilePageState.activeDrag = null;
  mobilePageState.pageTurning = false;
}

function scheduleDeferredReaderSync(delay = 2600, refreshBooks = false) {
  clearTimeout(mobilePageState.resumeSyncTimer);
  mobilePageState.resumeSyncTimer = null;
  if (document.hidden || !navigator.onLine) return;
  mobilePageState.resumeSyncTimer = setTimeout(() => {
    mobilePageState.resumeSyncTimer = null;
    if (document.hidden || !navigator.onLine) return;
    void tryResumeOfflineReaderSync({refreshBooks})
      .catch(error => console.warn('화면 복귀 동기화 지연', error));
  }, delay);
}

function suspendMobileReader() {
  if (!isMobileReadingLayout()) return;
  if (!mobilePageState.suspended) mobilePageState.hiddenAt = Date.now();
  mobilePageState.suspended = true;
  cancelMobileTransientEffects();
  clearTimeout(mobilePageState.resumeSyncTimer);
  mobilePageState.resumeSyncTimer = null;
  // 이미 계산된 독서 화면을 버리지 않고 로컬에 마지막 상태만 남깁니다.
  try {
    localStorage.setItem(OFFLINE_LOCAL_STATE_KEY, JSON.stringify(readerState));
  } catch (_) {}
}

function resumeMobileReader() {
  if (!isMobileReadingLayout() || document.hidden) return;
  const now = Date.now();
  // visibilitychange와 pageshow가 연달아 오더라도 복귀 작업은 한 번만.
  if (!mobilePageState.suspended && now - mobilePageState.lastResumeAt < 1800) return;
  const asleepMs = mobilePageState.hiddenAt ? now - mobilePageState.hiddenAt : 0;
  const deepWake = asleepMs >= 45000;
  mobilePageState.hiddenAt = 0;
  mobilePageState.lastResumeAt = now;
  mobilePageState.suspended = false;

  // 긴 잠금에서는 Android의 메모리/뷰포트 복원 시간을 확보합니다.
  // 읽던 페이지는 그대로 보여주고, 재페이지화만 지연시킵니다.
  mobilePageState.resumeStabilizeUntil = now + (deepWake ? 4800 : 1300);
  scheduleMobileViewportRefresh(deepWake ? 4850 : 1400);

  // Google Drive 동기화는 정말 저장할 변경사항이 있을 때만 실행합니다.
  // 책 목록은 이 시점에 갱신하지 않아 불필요한 UI 재구성을 방지합니다.
  scheduleDeferredReaderSync(deepWake ? 5600 : 2400, false);
}

/* =========================================================
   v13 EPUB 위치 인덱스는 요청 시 계산합니다.
   EPUB 전체 위치 계산은 특히 장시간 화면 잠금 후 재실행될 때
   수 초간 메인 스레드를 점유할 수 있습니다.
   일반 독서에서는 가벼운 spine/페이지 기반 진행률을 표시합니다.
   전체 진행바로 위치 이동을 요청한 경우에만 정밀 인덱스를 준비합니다.
========================================================= */
function startMobileEpubLocations(book) {
  // 자동 전체 계산을 하지 않습니다. 진행바 이동 시 ensure 함수가 준비합니다.
  if (!isMobilePagedReading() || !book) return;
  mobilePageState.epubLocationsReady = false;
  mobilePageState.epubLocationBook = null;
  mobilePageState.epubLocationTask = null;
}

async function ensureMobileEpubLocations(book) {
  if (!book || epubBook !== book || !book.locations) return false;
  if (mobilePageState.epubLocationsReady &&
      mobilePageState.epubLocationBook === book) return true;
  if (mobilePageState.epubLocationTask) return mobilePageState.epubLocationTask;

  mobilePageState.epubLocationTask = (async () => {
    try {
      await book.ready;
      // 사용자가 탭을 잠근 동안에는 계산을 시작하지 않습니다.
      while (document.hidden || mobilePageState.suspended) {
        await new Promise(resolve => {
          const ready = () => {
            if (document.hidden || mobilePageState.suspended) return;
            document.removeEventListener('visibilitychange', ready);
            resolve();
          };
          document.addEventListener('visibilitychange', ready);
        });
      }
      if (epubBook !== book) return false;
      // 화면에 진행 상태가 먼저 표시되게 프레임을 한 번 넘깁니다.
      await new Promise(resolve => setTimeout(resolve, 60));
      if (epubBook !== book || document.hidden) return false;
      await book.locations.generate(1500);
      if (epubBook !== book) return false;
      mobilePageState.epubLocationsReady = true;
      mobilePageState.epubLocationBook = book;
      updateMobileProgressDisplay();
      return true;
    } catch (error) {
      console.warn('EPUB 위치 인덱스 계산 실패', error);
      return false;
    } finally {
      mobilePageState.epubLocationTask = null;
    }
  })();
  return mobilePageState.epubLocationTask;
}

initializeMobilePagedReading();
document.documentElement.dataset.readerBuild = 'v16-cloud-priority';

/* =========================================================
   PWA 설치 및 폴더 관리 스타일
========================================================= */
(function initializeReaderPwa() {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = isMobileReaderDevice()
    ? "./manifest-android.webmanifest?v=10"
    : "./manifest.webmanifest?v=10";
  document.head.appendChild(link);
  const meta = document.createElement("meta");
  meta.name = "theme-color"; meta.content = "#efe0c3";
  document.head.appendChild(meta);
  const style = document.createElement("style");
  style.textContent = `
    .library-controls { display:flex; gap:6px; margin:8px 0; flex-wrap:wrap; }
    .library-action { border:1px solid rgba(120,120,120,.35); border-radius:7px; background:transparent; color:inherit; padding:6px 8px; cursor:pointer; font-size:13px; }
    .library-breadcrumb { display:flex; flex-wrap:wrap; gap:3px; margin:8px 0 12px; }
    .library-row { display:flex; align-items:center; gap:3px; width:100%; }
    .library-row .book-item { flex:1; min-width:0; overflow-wrap:anywhere; }
    .library-row .library-action { flex:none; margin-bottom:5px; font-size:18px; }
  `;
  document.head.appendChild(style);
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js?v=16").then(reg => {
        reg.update().catch(() => {});
        // 강제로 캐시를 삭제하지 않고 새 서비스 워커 활성화 후 한 번만 다시 읽습니다.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (sessionStorage.getItem('reader-v16-updated') !== '1') {
            sessionStorage.setItem('reader-v16-updated','1');
            location.reload();
          }
        });
      }).catch(error => console.warn("PWA 등록 실패", error));
    });
  }
})();



/* =========================================================
   v14 TXT: 원본/장/페이지 캐시 + 현재 페이지 단독 렌더링
   - TXT 원본은 기존 books IndexedDB에 그대로 보관
   - 분리된 장과 페이지 경계는 IndexedDB에 캐시
   - DOM에는 현재 페이지 텍스트만 표시 (긴 장 전체 렌더 방지)
   - 처음 생성한 페이지 경계는 천천히 계산하고 재사용
========================================================= */
let virtualTxtActive = null;
let virtualTxtEpoch = 0;
const virtualTxtLayoutMemory = new Map();
let virtualTxtPageProbe = null;
let virtualTxtBackgroundTimer = null;
let virtualTxtSaveTimer = null;

function isVirtualMobileTxt() {
  return isMobilePagedReading() && isMobileTxtBook();
}

function initVirtualTxtCss() {
  if (document.getElementById('virtualTxtStyle')) return;
  const style = document.createElement('style');
  style.id = 'virtualTxtStyle';
  style.textContent = `
    @media(max-width:800px) {
      body.mobile-paged-reading.virtual-txt #txtScrollArea {
        overflow:hidden !important; scroll-behavior:auto !important;
      }
      body.mobile-paged-reading.virtual-txt #txtContent {
        columns:auto !important; column-width:auto !important;
        column-count:1 !important; column-gap:normal !important;
        max-height:100% !important; overflow:hidden !important;
      }
    }`;
  document.head.appendChild(style);
}

function virtualTxtLayoutSignature() {
  const size = readMobileViewportSize();
  const width = Math.max(150, size?.width || window.innerWidth);
  const height = Math.max(150, size?.height || window.innerHeight);
  const settings = readerState.settings;
  // 눈보호 배경/밝기는 페이지 나눔에 영향을 주지 않습니다.
  return `${Math.round(width)}x${Math.round(height)}:` +
    `${Number(settings.fontSize)}:${Number(settings.lineHeight)}`;
}

function virtualTxtKnownPageCount() {
  const layout = virtualTxtActive;
  if (!layout) return 1;
  const ready = Math.max(1, layout.boundaries.length - 1);
  return layout.complete ? ready : ready + 1;
}

function virtualTxtApproximatePageCount(layout) {
  if (!layout) return 1;
  if (layout.complete) return Math.max(1, layout.boundaries.length - 1);
  const chapter = txtChapters[layout.chapterIndex]?.content || '';
  const lengths = [];
  for (let i = 1; i < Math.min(layout.boundaries.length, 7); i++) {
    const n = layout.boundaries[i] - layout.boundaries[i-1];
    if (n > 0) lengths.push(n);
  }
  const average = lengths.length
    ? lengths.reduce((a,b) => a+b, 0) / lengths.length
    : 450;
  return Math.max(1, Math.ceil(chapter.length / Math.max(1, average)));
}

function virtualTxtCurrentOffset() {
  const layout = virtualTxtActive;
  if (!layout) return 0;
  return layout.boundaries[mobilePageState.txtPageIndex] || 0;
}

function virtualTxtProbe() {
  if (!virtualTxtPageProbe) {
    virtualTxtPageProbe = document.createElement('div');
    virtualTxtPageProbe.id = 'virtualTxtPageProbe';
    Object.assign(virtualTxtPageProbe.style, {
      position:'fixed', left:'-10000px', top:'0',
      zIndex:'-1', visibility:'hidden', pointerEvents:'none',
      boxSizing:'border-box', height:'auto', maxHeight:'none',
      overflow:'visible', whiteSpace:'pre-wrap',
      overflowWrap:'anywhere', wordBreak:'break-word',
      padding:'22px 0 36px', margin:'0', columnCount:'1',
      contain:'layout style'
    });
    document.body.appendChild(virtualTxtPageProbe);
  }
  const css = getComputedStyle(txtContent);
  const size = readMobileViewportSize();
  const width = Math.max(120, (size?.width || window.innerWidth) - 32);
  Object.assign(virtualTxtPageProbe.style, {
    width: `${width}px`,
    fontFamily: css.fontFamily,
    fontSize: `${readerState.settings.fontSize}px`,
    lineHeight: String(readerState.settings.lineHeight),
    letterSpacing: css.letterSpacing,
    fontWeight: css.fontWeight,
    fontStyle: css.fontStyle,
    textIndent: css.textIndent,
    textAlign: css.textAlign
  });
  return virtualTxtPageProbe;
}

// 현재 화면 한 페이지만 계산합니다. 장 전체를 DOM으로 펼치지 않습니다.
function virtualTxtPaginateOne(layout) {
  if (!layout || layout.complete) return false;
  const chapter = txtChapters[layout.chapterIndex]?.content || '';
  const start = layout.boundaries[layout.boundaries.length - 1] || 0;
  if (start >= chapter.length) { layout.complete = true; return false; }
  const probe = virtualTxtProbe();
  const height = Math.max(180, txtScrollArea.clientHeight || window.innerHeight);
  const fits = end => {
    probe.textContent = chapter.slice(start, end);
    return probe.scrollHeight <= height + 1;
  };
  // 대략적인 글자 수 범위에서 적정 페이지 경계를 이진 탐색합니다.
  let low = Math.min(chapter.length, start + 1);
  let high = Math.min(chapter.length, start + 800);
  let budget = 0;
  while (high < chapter.length && fits(high) && budget++ < 5) {
    low = high;
    high = Math.min(chapter.length, start + (high - start) * 2);
  }
  if (fits(high)) low = high;
  else {
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(mid)) low = mid;
      else high = mid - 1;
    }
  }
  // 큰 글씨나 매우 작은 화면에서도 반드시 전진하게 합니다.
  const end = Math.min(chapter.length, Math.max(start + 1, low));
  layout.boundaries.push(end);
  if (end >= chapter.length) layout.complete = true;
  return true;
}

function virtualTxtEnsurePage(pageIndex) {
  const layout = virtualTxtActive;
  if (!layout || layout.chapterIndex !== currentTxtChapter) return;
  // 제스처 시작 시 최대 2페이지 앞까지만 즉시 준비합니다.
  const wanted = Math.max(0, pageIndex) + 1;
  let count = 0;
  while (!layout.complete && layout.boundaries.length <= wanted && count++ < 3) {
    virtualTxtPaginateOne(layout);
  }
  mobilePageState.txtPages = virtualTxtKnownPageCount();
  scheduleVirtualTxtLayoutSave();
}

function virtualTxtDisplayPage(index, save = true) {
  const layout = virtualTxtActive;
  if (!layout) return;
  virtualTxtEnsurePage(index);
  const total = Math.max(1, layout.boundaries.length - 1);
  const page = Math.max(0, Math.min(index, total - 1));
  mobilePageState.txtPageIndex = page;
  mobilePageState.txtPages = virtualTxtKnownPageCount();
  const start = layout.boundaries[page] || 0;
  const end = layout.boundaries[page + 1] ?? start;
  const chapter = txtChapters[currentTxtChapter]?.content || '';
  txtContent.textContent = chapter.slice(start, end);
  txtScrollArea.scrollLeft = 0;
  txtScrollArea.scrollTop = 0;
  mobilePageState.viewportSize = readMobileViewportSize();
  updateMobileProgressDisplay();
  if (save) saveVirtualMobileTxtProgress();
  scheduleVirtualTxtIdlePagination();
}

function saveVirtualMobileTxtProgress() {
  if (!selectedBook || !virtualTxtActive) return;
  const length = Math.max(1, txtChapters[currentTxtChapter]?.content.length || 1);
  const offset = virtualTxtCurrentOffset();
  const ratio = offset / length;
  readerState.txtProgress[selectedBook.id] = {
    chapterIndex: currentTxtChapter,
    charOffset: offset,
    scrollRatio: ratio,
    pageRatio: ratio
  };
  scheduleStateSave();
}

function virtualTxtCacheKey(bookId, chapterIndex, signature) {
  return `${bookId}|${chapterIndex}|${signature}|v14`;
}

async function virtualTxtLoadLayout(bookId, chapterIndex) {
  const sig = virtualTxtLayoutSignature();
  const savedVersion = readOfflineBookIndex().find(item => item.id === bookId)?.savedAt || 0;
  const id = virtualTxtCacheKey(bookId, chapterIndex, `${sig}:${savedVersion}`);
  let layout = virtualTxtLayoutMemory.get(id);
  if (!layout) {
    const cached = await readReaderCacheRecord(TXT_LAYOUT_STORE, id);
    if (cached?.version === TXT_CACHE_FORMAT_VERSION &&
        Array.isArray(cached.boundaries) && cached.boundaries[0] === 0) {
      layout = {id, bookId, chapterIndex, signature:sig,
        boundaries:cached.boundaries, complete:!!cached.complete};
    } else {
      layout = {id, bookId, chapterIndex, signature:sig,
        boundaries:[0], complete:false};
    }
    virtualTxtLayoutMemory.set(id, layout);
    if (virtualTxtLayoutMemory.size > 14) {
      const first = virtualTxtLayoutMemory.keys().next().value;
      virtualTxtLayoutMemory.delete(first);
    }
  }
  return layout;
}

function scheduleVirtualTxtLayoutSave() {
  clearTimeout(virtualTxtSaveTimer);
  virtualTxtSaveTimer = setTimeout(() => {
    const layout = virtualTxtActive;
    if (!layout) return;
    void writeReaderCacheRecord(TXT_LAYOUT_STORE, {
      id:layout.id, version:TXT_CACHE_FORMAT_VERSION,
      bookId:layout.bookId, chapterIndex:layout.chapterIndex,
      boundaries:layout.boundaries.slice(), complete:layout.complete
    });
  }, 1600);
}

function scheduleVirtualTxtIdlePagination() {
  clearTimeout(virtualTxtBackgroundTimer);
  const layout = virtualTxtActive;
  if (!layout || layout.complete || document.hidden || mobilePageState.suspended) return;
  // 손가락 조작을 최우선으로: 한 번에 한 페이지만 미리 계산합니다.
  virtualTxtBackgroundTimer = setTimeout(() => {
    if (document.hidden || mobilePageState.suspended ||
        virtualTxtActive !== layout || mobilePageState.pageTurning) return;
    const work = () => {
      if (document.hidden || mobilePageState.suspended ||
          virtualTxtActive !== layout || mobilePageState.pageTurning) return;
      virtualTxtPaginateOne(layout);
      mobilePageState.txtPages = virtualTxtKnownPageCount();
      if (layout.complete) {
        scheduleVirtualTxtLayoutSave();
        updateMobileProgressDisplay();
      } else scheduleVirtualTxtIdlePagination();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(work, {timeout:2200});
    else work();
  }, 850);
}

async function virtualTxtSeekOffset(offset, requestEpoch = virtualTxtEpoch, shouldSave = true) {
  const layout = virtualTxtActive;
  if (!layout) return;
  const target = Math.max(0, Math.floor(offset));
  let sinceYield = 0;
  while (!layout.complete && layout.boundaries[layout.boundaries.length-1] <= target) {
    if (requestEpoch !== virtualTxtEpoch || virtualTxtActive !== layout) return;
    virtualTxtPaginateOne(layout);
    if (++sinceYield >= 3) {
      sinceYield = 0;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  if (requestEpoch !== virtualTxtEpoch || virtualTxtActive !== layout) return;
  let low = 0, high = layout.boundaries.length - 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (layout.boundaries[mid] <= target) low = mid;
    else high = mid - 1;
  }
  virtualTxtDisplayPage(low, shouldSave);
}

async function activateVirtualTxtChapter(ratio = 0) {
  if (!isVirtualMobileTxt() || !selectedBook) return;
  initVirtualTxtCss();
  document.body.classList.add('virtual-txt');
  const epoch = ++virtualTxtEpoch;
  const bookId = selectedBook.id;
  const chapterIndex = currentTxtChapter;
  const layout = await virtualTxtLoadLayout(bookId, chapterIndex);
  if (epoch !== virtualTxtEpoch || selectedBook?.id !== bookId ||
      currentTxtChapter !== chapterIndex) return;
  virtualTxtActive = layout;
  const chapter = txtChapters[chapterIndex]?.content || '';
  const progress = readerState.txtProgress[bookId] || {};
  const sameChapter = progress.chapterIndex === chapterIndex;
  const storedChar = sameChapter && Number.isFinite(progress.charOffset)
    ? progress.charOffset : chapter.length * Math.max(0, Math.min(1, ratio));
  // 반복 실행부터는 IDB에 저장된 경계를 활용하여 거의 즉시 복원합니다.
  virtualTxtEnsurePage(0);
  await virtualTxtSeekOffset(storedChar, epoch, false);
}

async function virtualTxtSeekRatio(ratio) {
  if (!virtualTxtActive) return;
  const text = txtChapters[currentTxtChapter]?.content || '';
  const epoch = ++virtualTxtEpoch;
  await virtualTxtSeekOffset(text.length * Math.max(0, Math.min(1, ratio)), epoch);
}

async function virtualTxtCommitPage(direction) {
  if (!virtualTxtActive) return;
  const next = mobilePageState.txtPageIndex + direction;
  virtualTxtEnsurePage(next);
  const known = Math.max(1, virtualTxtActive.boundaries.length - 1);
  if (next >= 0 && next < known) {
    virtualTxtDisplayPage(next, true);
  } else if (direction > 0 && currentTxtChapter < txtChapters.length - 1) {
    await moveTxtChapter(currentTxtChapter + 1, 0);
    await nextMobileAnimationFrame();
  } else if (direction < 0 && currentTxtChapter > 0) {
    await moveTxtChapter(currentTxtChapter - 1, 1);
    await nextMobileAnimationFrame();
  }
}

async function virtualTxtRefreshAfterResize() {
  if (!isVirtualMobileTxt()) return;
  const old = virtualTxtActive;
  const charOffset = virtualTxtCurrentOffset();
  const signature = virtualTxtLayoutSignature();
  if (old?.signature === signature) {
    mobilePageState.viewportSize = readMobileViewportSize();
    return;
  }
  const epoch = ++virtualTxtEpoch;
  const layout = await virtualTxtLoadLayout(selectedBook.id, currentTxtChapter);
  if (epoch !== virtualTxtEpoch) return;
  virtualTxtActive = layout;
  await virtualTxtSeekOffset(charOffset, epoch);
}

window.addEventListener('pagehide', () => {
  if (virtualTxtActive) {
    const layout = virtualTxtActive;
    void writeReaderCacheRecord(TXT_LAYOUT_STORE, {
      id:layout.id, version:TXT_CACHE_FORMAT_VERSION,
      bookId:layout.bookId, chapterIndex:layout.chapterIndex,
      boundaries:layout.boundaries.slice(), complete:layout.complete
    });
  }
});

/* =========================================================
   v10: 밝기, 오프라인 책 저장, 연결 복구 시 읽던 위치 동기화
   - 로컬에는 OAuth 토큰을 새로 저장하지 않습니다.
   - 책 원본은 IndexedDB에 저장합니다.
   - 읽던 위치는 소량의 JSON이므로 localStorage에 즉시 저장합니다.
========================================================= */

const OFFLINE_READER_DB = "drive-novel-offline-v1";
const OFFLINE_READER_STORE = "books";
const TXT_PARSED_STORE = "txtChapters";
const TXT_LAYOUT_STORE = "txtLayouts";
const TXT_CACHE_FORMAT_VERSION = 14;
const OFFLINE_BOOK_INDEX_KEY = "driveReaderOfflineBookIndexV1";
const OFFLINE_LOCAL_STATE_KEY = "driveReaderLastLocalStateV1";
const OFFLINE_PENDING_STATE_KEY = "driveReaderPendingSyncV1";
let cloudReaderStateReady = false;
let offlineStoreDbPromise = null;
let lastOfflineStatus = "";

function openOfflineReaderDb() {
  if (!offlineStoreDbPromise) {
    offlineStoreDbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('이 브라우저는 IndexedDB 오프라인 저장을 지원하지 않습니다.'));
        return;
      }
      const request = indexedDB.open(OFFLINE_READER_DB, 2);
      request.onupgradeneeded = () => {
        for (const name of [OFFLINE_READER_STORE, TXT_PARSED_STORE, TXT_LAYOUT_STORE]) {
          if (!request.result.objectStoreNames.contains(name)) {
            request.result.createObjectStore(name, {keyPath:'id'});
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { offlineStoreDbPromise = null; throw error; });
  }
  return offlineStoreDbPromise;
}

async function saveOfflineBookRecord(record) {
  const db = await openOfflineReaderDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_READER_STORE, 'readwrite');
    tx.objectStore(OFFLINE_READER_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('기기 저장소 쓰기 실패'));
    tx.onabort = () => reject(tx.error || new Error('기기 저장 취소'));
  });
}

async function readOfflineBook(fileId) {
  const db = await openOfflineReaderDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(OFFLINE_READER_STORE, 'readonly')
      .objectStore(OFFLINE_READER_STORE).get(fileId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function readReaderCacheRecord(storeName, id) {
  try {
    const db = await openOfflineReaderDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly')
        .objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('리더 캐시 조회 실패:', storeName, error);
    return null;
  }
}

async function writeReaderCacheRecord(storeName, record) {
  try {
    const db = await openOfflineReaderDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch (error) {
    console.warn('리더 캐시 저장 실패:', storeName, error);
    return false;
  }
}

function readOfflineBookIndex() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_BOOK_INDEX_KEY) || '[]'); }
  catch { return []; }
}
function hasOfflineBook(fileId) {
  return readOfflineBookIndex().some(x => x.id === fileId);
}
function cacheOfflineBookIndex(record) {
  const index = readOfflineBookIndex().filter(x => x.id !== record.id);
  index.unshift({id:record.id, name:record.name, mimeType:record.mimeType,
    modifiedTime:record.modifiedTime || '', savedAt: Date.now()});
  localStorage.setItem(OFFLINE_BOOK_INDEX_KEY, JSON.stringify(index));
}

const EPUB_RUNTIME_URL =
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
const READER_SHELL_CACHE = 'drive-novel-reader-v17-trusted-progress-20261019';
async function ensureOfflineEpubReaderRuntime() {
  if (!('caches' in window)) {
    throw new Error('EPUB 오프라인 실행 파일을 저장할 수 없는 브라우저입니다.');
  }
  const cache = await caches.open(READER_SHELL_CACHE);
  if (await cache.match(EPUB_RUNTIME_URL)) return;
  const response = await fetch(EPUB_RUNTIME_URL, {mode:'cors'});
  if (!response.ok) throw new Error('EPUB 실행 파일 내려받기에 실패했습니다.');
  await cache.put(EPUB_RUNTIME_URL, response.clone());
}

async function saveCurrentBookOffline() {
  if (!selectedBook) { alert('먼저 책을 열어 주세요.'); return; }
  if (!navigator.onLine) {
    alert(hasOfflineBook(selectedBook.id)
      ? '이 책은 이미 오프라인 저장되어 있습니다.'
      : '처음 저장할 때는 인터넷에 연결되어 있어야 합니다.');
    return;
  }
  const originalBookId = selectedBook.id;
  const originalBookName = selectedBook.name;
  const menuButton = document.getElementById('mReaderOfflineSave');
  if (menuButton) { menuButton.disabled = true; menuButton.textContent = '저장 중...'; }
  if (desktopOfflineButton) { desktopOfflineButton.disabled = true;
    desktopOfflineButton.textContent = '책을 기기에 저장 중...'; }

  try {
    // 기존 캐시가 있더라도 '저장'을 누르면 Drive에서 최신 원본으로 갱신합니다.
    const response = await apiFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(originalBookId)}?alt=media`);
    const blob = await response.blob();
    if (originalBookName.toLowerCase().endsWith('.epub')) {
      // EPUB 파일을 읽는 라이브러리도 미리 보관해야 진짜 오프라인 읽기가 됩니다.
      await ensureOfflineEpubReaderRuntime();
    }
    const savedAt = Date.now();
    await saveOfflineBookRecord({id: originalBookId, name: originalBookName,
      mimeType: originalBookName.toLowerCase().endsWith('.epub') ?
        'application/epub+zip' : 'text/plain',
      savedAt, blob});
    if (originalBookName.toLowerCase().endsWith('.txt')) {
      // 최초 다운로드에서 장 분리는 단 한 번 수행하고 결과를 영구 보관합니다.
      // 다음 실행부터는 거대한 원본 TXT를 다시 읽거나 정규식으로 분리하지 않습니다.
      const text = await blob.text();
      const chapters = splitTxtIntoChapters(text);
      await writeReaderCacheRecord(TXT_PARSED_STORE, {
        id: originalBookId, savedAt, version: TXT_CACHE_FORMAT_VERSION,
        chapters
      });
      // 같은 파일을 새로 저장했다면 이전 레이아웃은 폐기(원본 변경 가능성).
      virtualTxtLayoutMemory.clear();
    }
    cacheOfflineBookIndex({id:originalBookId,name:originalBookName,
      mimeType: originalBookName.toLowerCase().endsWith('.epub') ?
        'application/epub+zip' : 'text/plain'});
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
    updateOfflineSaveButtons();
    alert('「' + originalBookName + '」 기기에 저장 완료!\n인터넷 없이도 이 앱에서 읽을 수 있습니다.');
  } catch (error) {
    alert('오프라인 저장 실패: ' + error.message +
      '\n기기 저장 공간과 인터넷 연결을 확인하세요.');
  } finally { updateOfflineSaveButtons(); }
}

let desktopOfflineButton = null;
function initializeOfflineDownloadButtons() {
  if (desktopOfflineButton || !sidebar) return;
  desktopOfflineButton = document.createElement('button');
  desktopOfflineButton.type = 'button';
  desktopOfflineButton.className = 'main-button';
  desktopOfflineButton.textContent = '↓ 현재 책 오프라인 저장';
  desktopOfflineButton.addEventListener('click', saveCurrentBookOffline);
  if (tocSection?.parentElement === sidebar) sidebar.insertBefore(desktopOfflineButton, tocSection);
  else sidebar.appendChild(desktopOfflineButton);
  updateOfflineSaveButtons();
}
function updateOfflineSaveButtons() {
  const saved = !!selectedBook && hasOfflineBook(selectedBook.id);
  const button = document.getElementById('mReaderOfflineSave');
  const label = saved ? '✓ 저장됨 · 다시 받기' : '↓ 오프라인 저장';
  if (button) { button.textContent = label; button.disabled = !selectedBook; }
  if (desktopOfflineButton) {
    desktopOfflineButton.textContent = selectedBook
      ? (saved ? '✓ 현재 책 저장됨 · 새로 받기' : '↓ 현재 책 오프라인 저장')
      : '↓ 책을 열면 오프라인 저장 가능';
    desktopOfflineButton.disabled = !selectedBook;
  }
}

function renderOfflineOnlyBookList() {
  const saved = readOfflineBookIndex();
  if (navigator.onLine && cloudReaderStateReady) return;
  if (!saved.length) {
    if (!navigator.onLine && bookList) bookList.textContent =
      '오프라인에 저장한 책이 없습니다. 인터넷 연결 중에 책을 열고 「오프라인 저장」을 눌러 주세요.';
    return;
  }
  books = saved.map(x => ({id:x.id,name:x.name,mimeType:x.mimeType}));
  folders = [];
  if (!bookList) return;
  bookList.replaceChildren();
  const status = document.createElement('div');
  status.className = 'section-title';
  status.textContent = '📥 오프라인 저장한 책 (' + saved.length + ')';
  bookList.appendChild(status);
  saved.forEach(book => {
    const button = document.createElement('button');
    button.className = 'book-item';
    button.textContent = '📖 ' + book.name;
    button.addEventListener('click', () => {
      openBook(book).catch(error => alert('책을 열 수 없습니다: ' + error.message));
    });
    bookList.appendChild(button);
  });
  if (loginStatus && !navigator.onLine) loginStatus.textContent =
    '오프라인 독서 · 읽던 위치는 이 기기에 저장됩니다';
  renderMobileBookshelf();
}
async function initializeOfflineReaderLibrary() {
  initializeOfflineDownloadButtons();
  if (!navigator.onLine || !libraryFolderId) renderOfflineOnlyBookList();
  // 기기 저장소 접근 가능 여부를 미리 확인하지만 실패해도 온라인 기능은 그대로 동작합니다.
  try { await openOfflineReaderDb(); }
  catch (error) { console.warn('오프라인 저장소 사용 불가', error); }
}

function getPendingReaderSync() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_PENDING_STATE_KEY) || 'null'); }
  catch { return null; }
}
function hasPendingReaderSync() {
  const p = getPendingReaderSync();
  return !!(p && [2, 3, 4].includes(p.schemaVersion) &&
    (Object.keys(p.bookIds || {}).length || p.settingsChanged || p.lastOpenedChanged));
}
function persistPendingReaderState() {
  try {
    const previous = JSON.parse(localStorage.getItem(OFFLINE_LOCAL_STATE_KEY) || 'null');
    if (readerCloudApplyInProgress) {
      localStorage.setItem(OFFLINE_LOCAL_STATE_KEY, JSON.stringify(readerState));
      return;
    }
    const existing = getPendingReaderSync();
    // 예전 대기 기록을 보존하되, 그 당시 잘못 생성됐을 수 있는
    // '사용자가 직접 변경함' 표시는 신뢰하지 않습니다.
    if (existing && existing.schemaVersion !== 4) {
      localStorage.setItem('driveReaderPreV17PendingBackup', JSON.stringify(existing));
    }
    const pending = existing ? {
      ...existing, schemaVersion:4,
      bookIds:{...(existing.bookIds || {})},
      explicitBookIds: existing.schemaVersion === 4
        ? {...(existing.explicitBookIds || {})} : {}
    } : {schemaVersion:4,bookIds:{},explicitBookIds:{},settingsChanged:false,
      lastOpenedChanged:false};
    pending.bookIds ||= {};
    pending.explicitBookIds ||= {};
    let changed = false;
    const now = Date.now();
    const wasUserAction = now <= readerUserActionUntil;
    for (const type of ['txtProgress', 'epubProgress']) {
      for (const [bookId, position] of Object.entries(readerState[type] || {})) {
        if (!isSameBookPosition(previous?.[type]?.[bookId], position)) {
          if (wasUserAction) {
            // 사용자 터치/휠/키보드로 실제 페이지를 바꿀 때만 동기화 대기를 생성합니다.
            position.updatedAt = now;
            position.userUpdatedAt = now;
            pending.bookIds[bookId] = now;
            pending.explicitBookIds[bookId] = true;
            readerProgressMutationCounter++;
            changed = true;
          }
          // 자동 화면 복원에서 일어난 위치 변경은 로컬로만 보관합니다.
        }
      }
    }
    if (previous && JSON.stringify(previous.settings) !== JSON.stringify(readerState.settings)) {
      pending.settingsChanged = true;
      changed = true;
    }
    if (previous && previous.lastOpenedBookId !== readerState.lastOpenedBookId) {
      pending.lastOpenedChanged = true;
      changed = true;
    }
    localStorage.setItem(OFFLINE_LOCAL_STATE_KEY, JSON.stringify(readerState));
    if (changed) {
      pending.version = now + Math.random();
      pending.lastOpenedBookId = readerState.lastOpenedBookId;
      pending.settings = readerState.settings;
      pending.state = JSON.parse(JSON.stringify(readerState));
      localStorage.setItem(OFFLINE_PENDING_STATE_KEY, JSON.stringify(pending));
      if (!navigator.onLine) updateOfflineSyncStatus('오프라인 · 읽던 위치 기기에 저장됨');
    }
  } catch (error) { console.warn('기기 읽기 위치 저장 실패', error); }
}

function restoreLocalReaderState() {
  try {
    const local = JSON.parse(localStorage.getItem(OFFLINE_LOCAL_STATE_KEY) || 'null');
    if (!local || !local.settings) return;
    readerState = {
      settings: {...readerState.settings, ...local.settings},
      lastOpenedBookId: local.lastOpenedBookId || null,
      txtProgress: local.txtProgress || {},
      epubProgress: local.epubProgress || {}
    };
  } catch (error) { console.warn('기기 위치 복원 실패', error); }
}
function applyPendingReaderState() {
  let pending = getPendingReaderSync();
  if (pending && pending.schemaVersion !== 4) {
    // 구버전은 실제 조작 없이 로컬 위치를 "명시적으로 변경"한 것으로 기록할 수 있습니다.
    // 한 번만 원본을 백업하고, 장 번호/검증된 사용자 조작 시각으로 다시 비교합니다.
    try {
      localStorage.setItem('driveReaderPreV17PendingBackup', JSON.stringify(pending));
      pending = {
        ...pending,
        schemaVersion: 4,
        bookIds: {...(pending.bookIds || {})},
        explicitBookIds: {},
        version: Date.now()
      };
      localStorage.setItem(OFFLINE_PENDING_STATE_KEY, JSON.stringify(pending));
    } catch (error) { console.warn('동기화 기록 업그레이드 실패', error); pending = null; }
  }
  if (pending?.state) {
    const local = pending.state;
    pending.bookIds ||= {};
    pending.explicitBookIds ||= {};
    for (const id of Object.keys(pending.bookIds)) {
      const localTxt = local.txtProgress?.[id];
      const localEpub = local.epubProgress?.[id];
      const remoteTxt = readerState.txtProgress?.[id];
      const remoteEpub = readerState.epubProgress?.[id];
      const localPosition = localTxt || localEpub;
      const remotePosition = remoteTxt || remoteEpub;
      if (!localPosition) {
        delete pending.bookIds[id];
        delete pending.explicitBookIds[id];
        continue;
      }
      const winner = compareCloudAndDeviceProgress(localPosition, remotePosition);
      if (winner === 'cloud' || winner === 'same') {
        // 앱이 열릴 때 자동으로 생성된 예전 대기 위치로 서버를 덮어쓰지 않습니다.
        delete pending.bookIds[id];
        delete pending.explicitBookIds[id];
        continue;
      }
      if (localTxt) readerState.txtProgress[id] = localTxt;
      if (localEpub) readerState.epubProgress[id] = localEpub;
    }
    if (pending.settingsChanged)
      readerState.settings = {...readerState.settings, ...(pending.settings || {})};
    if (pending.lastOpenedChanged && pending.lastOpenedBookId)
      readerState.lastOpenedBookId = pending.lastOpenedBookId;
    if (!Object.keys(pending.bookIds).length && !pending.settingsChanged &&
        !pending.lastOpenedChanged) {
      localStorage.removeItem(OFFLINE_PENDING_STATE_KEY);
    } else {
      pending.state = JSON.parse(JSON.stringify(readerState));
      localStorage.setItem(OFFLINE_PENDING_STATE_KEY, JSON.stringify(pending));
    }
  }
  try { localStorage.setItem(OFFLINE_LOCAL_STATE_KEY, JSON.stringify(readerState)); }
  catch (error) { console.warn('로컬 병합 저장 실패', error); }
}

function updateOfflineSyncStatus(text) {
  lastOfflineStatus = text;
  if (!navigator.onLine && loginStatus) loginStatus.textContent = text;
  const note = document.getElementById('offlineReaderSyncNote');
  if (note) note.textContent = text;
}

let brightnessOverlay = null;
let brightnessRange = null;
let brightnessValue = null;
function initializeReaderBrightness() {
  if (!settingsPanel || brightnessRange) return;
  const label = document.createElement('label');
  label.style.cssText = 'display:block;margin:14px 0;';
  const title = document.createElement('span');
  title.textContent = '☀ 읽기 화면 밝기 (앱 내부) ';
  brightnessValue = document.createElement('span');
  brightnessValue.textContent = '100%';
  brightnessRange = document.createElement('input');
  brightnessRange.type = 'range'; brightnessRange.min = '20';
  brightnessRange.max = '100'; brightnessRange.step = '5';
  brightnessRange.value = String(readerState.settings.brightness ?? 100);
  brightnessRange.setAttribute('aria-label', '읽기 화면 밝기');
  brightnessRange.style.cssText = 'display:block;width:100%;margin-top:10px;';
  settingsPanel.style.maxHeight = 'calc(100dvh - 90px)';
  settingsPanel.style.overflowY = 'auto';
  brightnessRange.addEventListener('input', () => {
    readerState.settings.brightness = Number(brightnessRange.value);
    applyReaderBrightness();
    scheduleStateSave();
  });
  label.append(title,brightnessValue,brightnessRange);
  const firstLabel = settingsPanel.querySelector('label');
  if (firstLabel) firstLabel.parentNode.insertBefore(label,firstLabel);
  else settingsPanel.appendChild(label);
  const note = document.createElement('small');
  note.id='offlineReaderSyncNote';
  note.style.cssText='display:block;opacity:.8;margin:8px 0;';
  note.textContent=lastOfflineStatus || '읽던 위치는 자동으로 저장됩니다.';
  settingsPanel.appendChild(note);
  applyReaderBrightness();
}
function applyReaderBrightness() {
  const percentage = Math.max(20, Math.min(100, Number(readerState.settings.brightness ?? 100)));
  if (brightnessRange) brightnessRange.value = String(percentage);
  if (brightnessValue) brightnessValue.textContent = percentage + '%';
  if (!brightnessOverlay) {
    brightnessOverlay = document.createElement('div');
    brightnessOverlay.id = 'readerBrightnessOverlay';
    Object.assign(brightnessOverlay.style, {
      position:'fixed',inset:'0',width:'100vw',height:'100dvh',
      pointerEvents:'none',zIndex:'9',background:'#000',opacity:'0'
    });
    document.body.appendChild(brightnessOverlay);
  }
  // 앱 화면만 어둡게 합니다. 실제 휴대폰의 시스템 밝기는 변경하지 않습니다.
  const dimOpacity = String((100-percentage) / 120);
  brightnessOverlay.style.opacity = dimOpacity;

  // 설정에서 밝기를 바꾸는 순간 이미 열린 페이지 전환 레이어도 갱신합니다.
  document.querySelectorAll('.mobile-paper-flip-dimmer').forEach(
    layer => { layer.style.opacity = dimOpacity; }
  );
}

async function tryResumeOfflineReaderSync({refreshBooks=true} = {}) {
  if (!navigator.onLine || document.hidden) return;
  if (window.google?.accounts?.oauth2 && !tokenClient) initGoogle();
  if (!tokenClient) {
    // 오프라인 시작 때 원격 Google 스크립트가 로드되지 않았을 수 있습니다.
    if (!document.getElementById('readerGisReconnectScript')) {
      const script = document.createElement('script');
      script.id = 'readerGisReconnectScript';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = waitForGoogle;
      document.head.appendChild(script);
    }
    return;
  }
  if (cloudReaderStateReady && accessToken) {
    await refreshReaderStateFromDrive();
    if (hasPendingReaderSync()) await saveState();
    if (refreshBooks && libraryFolderId) await loadBooks();
    return;
  }
  if (localStorage.getItem(GOOGLE_CONNECTED_KEY) === '1') {
    await autoReconnectGoogleDrive();
  }
}
// 앱으로 복귀했을 때, 로컬에 변경사항이 없어도 PC의 최신 위치를 가져옵니다.
// 갱신 간격을 제한하여 잦은 탭 전환/화면 잠금 해제 시 호출을 합칩니다.
window.addEventListener('focus', () => {
  if (document.hidden || !navigator.onLine || !accessToken) return;
  if (Date.now() - lastReaderCloudCheckAt > 15000)
    scheduleDeferredReaderSync(isMobileReadingLayout() ? 4800 : 1300, false);
});

window.addEventListener('online', () => {
  updateOfflineSyncStatus('인터넷 연결됨 · 읽던 위치 동기화 대기 중...');
  // Wi-Fi 재연결과 화면 잠금 해제가 겹쳐도 동기화 1회로 묶습니다.
  // 잠금 복귀 중 연결이 돌아오면 책 목록 전체를 재로드하지 않습니다.
  // 읽던 위치 동기화가 필요한 경우에만 낮은 우선순위로 실행합니다.
  const deepWake = Date.now() < (mobilePageState.resumeStabilizeUntil || 0);
  scheduleDeferredReaderSync(deepWake ? 5800 : 2500,
    !cloudReaderStateReady);
});
window.addEventListener('offline', () => {
  clearTimeout(mobilePageState.resumeSyncTimer);
  mobilePageState.resumeSyncTimer = null;
  updateOfflineSyncStatus('오프라인 · 읽던 위치 기기에 저장됨');
  renderOfflineOnlyBookList();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspendMobileReader();
  else if (isMobileReadingLayout()) resumeMobileReader();
  else scheduleDeferredReaderSync();
});
window.addEventListener('pagehide', suspendMobileReader);
window.addEventListener('pageshow', () => {
  if (!document.hidden && isMobileReadingLayout()) resumeMobileReader();
});
function initializeManualReaderSyncButton() {
  if (!settingsPanel || document.getElementById('readerSyncNowBtn')) return;
  const button = document.createElement('button');
  button.id = 'readerSyncNowBtn';
  button.type = 'button';
  button.textContent = '⟳ 다른 기기 읽던 위치 불러오기';
  button.style.cssText = 'display:block;width:100%;padding:12px;margin:12px 0;' +
    'border:1px solid #999;border-radius:8px;background:transparent;color:inherit;';
  button.addEventListener('click', async () => {
    if (!navigator.onLine) {
      alert('인터넷 연결이 필요합니다. 오프라인에서 읽던 위치는 보관 중입니다.');
      return;
    }
    if (!accessToken) {
      alert('Google Drive 연결 후 다시 눌러 주세요.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Drive 읽던 위치 확인 중...';
    try {
      const ok = await refreshReaderStateFromDrive();
      if (ok) {
        // 서버에 더 새로운 위치가 없더라도 상태를 확인했다는 사실을 알립니다.
        applySettings();
        const id = selectedBook?.id;
        const isTxt = selectedBook?.name?.toLowerCase().endsWith('.txt');
        const cloud = id ? (isTxt ? lastFetchedDriveReadingState?.txtProgress?.[id] :
          lastFetchedDriveReadingState?.epubProgress?.[id]) : null;
        const local = id ? (isTxt ? readerState.txtProgress?.[id] :
          readerState.epubProgress?.[id]) : null;
        const titleFor = position => {
          if (!position) return '기록 없음';
          if (isTxt) return txtChapters?.[position.chapterIndex]?.title ||
            `${(Number(position.chapterIndex) || 0) + 1}번째 장`;
          return position.cfi ? 'EPUB 위치 있음' : '기록 없음';
        };
        alert('Drive 저장 위치: ' + titleFor(cloud) + '\n' +
          '현재 기기 위치: ' + titleFor(local) + '\n\n' +
          'Drive 위치가 더 최신이라면 반영됩니다.');
      } else alert('Google Drive 위치를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      button.textContent = '⟳ 다른 기기 읽던 위치 불러오기';
      button.disabled = false;
    }
  });
  settingsPanel.appendChild(button);

  // 현재 기기에 남아 있는 잘못된 구버전 기록을 무시하고 서버 위치를 강제로 적용합니다.
  const forceButton = document.createElement('button');
  forceButton.type = 'button';
  forceButton.id = 'readerForceCloudBtn';
  forceButton.textContent = '☁ 현재 책을 Drive에 저장된 위치로 이동';
  forceButton.style.cssText = button.style.cssText;
  forceButton.addEventListener('click', async () => {
    if (!selectedBook || !navigator.onLine || !accessToken) {
      alert('현재 책을 연 상태에서 Google Drive를 연결해 주세요.'); return;
    }
    forceButton.disabled = true;
    const id = selectedBook.id;
    const isTxt = selectedBook.name.toLowerCase().endsWith('.txt');
    try {
      const ok = await refreshReaderStateFromDrive({applyToOpenedBook:false});
      if (!ok) { alert('Drive에서 읽던 위치를 가져오지 못했습니다.'); return; }
      const position = structuredClone(isTxt
        ? lastFetchedDriveReadingState?.txtProgress?.[id]
        : lastFetchedDriveReadingState?.epubProgress?.[id]);
      if (!position) { alert('Drive에 이 책의 읽던 위치가 없습니다. PC에서 먼저 저장해 주세요.'); return; }
      const pending = getPendingReaderSync();
      if (pending?.bookIds) {
        delete pending.bookIds[id];
        delete pending.explicitBookIds?.[id];
        if (!Object.keys(pending.bookIds).length && !pending.settingsChanged &&
            !pending.lastOpenedChanged) localStorage.removeItem(OFFLINE_PENDING_STATE_KEY);
        else {
          if (pending.state) {
            (pending.state[isTxt?'txtProgress':'epubProgress'] ||= {})[id] = position;
          }
          localStorage.setItem(OFFLINE_PENDING_STATE_KEY, JSON.stringify(pending));
        }
      }
      const target = isTxt ? readerState.txtProgress : readerState.epubProgress;
      const previous = structuredClone(target[id] || null);
      target[id] = position;
      localStorage.setItem(OFFLINE_LOCAL_STATE_KEY, JSON.stringify(readerState));
      await applyLatestCloudPositionToOpenBook(previous, id);
      const txtTitle = isTxt ? (txtChapters?.[position.chapterIndex]?.title ||
        `${(Number(position.chapterIndex)||0)+1}번째 장`) : 'EPUB 위치';
      alert('Drive 위치로 이동했습니다: ' + txtTitle);
    } catch (error) { console.error(error); alert('동기화 오류: ' + error.message); }
    finally { forceButton.disabled = false; }
  });
  settingsPanel.appendChild(forceButton);

  // PC에서 보이는 페이지가 실제 Drive에 업로드되어 있는지 확인하기 위한 수동 저장.
  // 이 버튼은 직접 누른 경우에만 해당 책 위치를 업로드 대상으로 지정합니다.
  const uploadButton = document.createElement('button');
  uploadButton.id = 'readerSyncUploadBtn';
  uploadButton.type = 'button';
  uploadButton.textContent = '☁ 지금 읽던 위치 Google Drive에 저장';
  uploadButton.style.cssText = button.style.cssText;
  uploadButton.addEventListener('click', async () => {
    if (!selectedBook) { alert('먼저 책을 열어주세요.'); return; }
    if (!navigator.onLine || !accessToken) {
      alert('인터넷과 Google Drive 연결이 필요합니다.'); return;
    }
    const id = selectedBook.id;
    const isTxt = selectedBook.name.toLowerCase().endsWith('.txt');
    if (isTxt && !isMobilePagedReading()) saveTxtScroll();
    const position = isTxt ? readerState.txtProgress?.[id] : readerState.epubProgress?.[id];
    if (!position) { alert('저장할 읽던 위치가 없습니다.'); return; }
    const now = Date.now();
    position.updatedAt = now;
    position.userUpdatedAt = now;
    let pending = getPendingReaderSync();
    if (pending?.schemaVersion !== 4) pending = {
      schemaVersion:4,bookIds:{},explicitBookIds:{},settingsChanged:false,
      lastOpenedChanged:false
    };
    pending.bookIds ||= {};
    pending.explicitBookIds ||= {};
    pending.bookIds[id] = now;
    pending.explicitBookIds[id] = true;
    pending.version = now + Math.random();
    pending.state = JSON.parse(JSON.stringify(readerState));
    pending.lastOpenedBookId = readerState.lastOpenedBookId;
    pending.settings = readerState.settings;
    localStorage.setItem(OFFLINE_PENDING_STATE_KEY, JSON.stringify(pending));
    localStorage.setItem(OFFLINE_LOCAL_STATE_KEY, JSON.stringify(readerState));
    readerProgressMutationCounter++;
    uploadButton.disabled = true;
    uploadButton.textContent = 'Drive에 저장 중...';
    try {
      const saved = await saveState();
      alert(saved ? '현재 책 읽던 위치를 Google Drive에 저장했습니다.' :
        '지금은 Drive에 저장하지 못했습니다. Google 연결을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = '☁ 지금 읽던 위치 Google Drive에 저장';
    }
  });
  settingsPanel.appendChild(uploadButton);
}
window.addEventListener('load', () => initializeManualReaderSyncButton());
window.addEventListener('load', () => initializeReaderBrightness());


/* =========================================================
   v18 · Android PWA 서재 홈
   - Drive 폴더 먼저 표시, 책은 아래 표시
   - 책을 눌러야 렌더링하므로 앱 첫 화면이 가벼움
   - 모바일에서만 사용하며 PC 독서 방식은 기존대로 유지
   - 책 원본은 기존 IndexedDB 오프라인 캐시 재사용
========================================================= */

const MOBILE_SHELF_VERSION = 'v18-drive-bookshelf-20261023';
const MOBILE_SHELF_CACHE_PREFIX = 'driveReaderShelfFolder-v18-';
let mobileShelfRoot = null;
let mobileShelfIsOpen = false;
let mobileShelfTab = 'all';
let mobileShelfSearchOpen = false;
let mobileShelfSearchText = '';
let mobileShelfLoading = false;
let mobileShelfDialog = null;
let mobileShelfBackMarker = false;

function shouldShowMobileShelf() {
  return isMobileReaderDevice() && window.matchMedia('(max-width:800px)').matches;
}

function mobileShelfCacheKey(folderId) {
  return MOBILE_SHELF_CACHE_PREFIX +
    ((folderId && folderId === libraryFolderId) || !folderId ? 'root' : folderId);
}

function rememberMobileShelfFolder(folderId, childFolders, childBooks) {
  try {
    const snapshot = {
      at: Date.now(),
      folders: childFolders.slice(0, 1000).map(f => ({
        id:f.id, name:f.name, mimeType:f.mimeType, parents:f.parents || [folderId]
      })),
      books:childBooks.slice(0, 2000).map(b => ({
        id:b.id, name:b.name, mimeType:b.mimeType, parents:b.parents || [folderId]
      }))
    };
    localStorage.setItem(mobileShelfCacheKey(folderId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('서재 목록 캐시 저장 실패', error);
  }
}

function readMobileShelfFolderCache(folderId) {
  try {
    return JSON.parse(localStorage.getItem(mobileShelfCacheKey(folderId)) || 'null');
  } catch { return null; }
}

function mobileShelfVisibleItems() {
  const cached = readMobileShelfFolderCache(currentFolderId);
  let visibleFolders = [];
  let visibleBooks = [];
  const currentlyConnected = !!libraryFolderId &&
    currentFolderId === (currentFolderId || libraryFolderId) && navigator.onLine;

  if (currentlyConnected && Array.isArray(folders) && Array.isArray(books) &&
      mobileShelfTab === 'all') {
    visibleFolders = [...folders];
    visibleBooks = [...books];
  } else if (cached) {
    visibleFolders = [...(cached.folders || [])];
    visibleBooks = [...(cached.books || [])];
  }

  // Previous reader versions only tracked locally saved books in the offline
  // index. Make those visible at the root even if a folder snapshot is absent.
  if (!cached && (!libraryFolderId || !navigator.onLine)) {
    visibleBooks = readOfflineBookIndex().map(book => ({
      id: book.id, name: book.name, mimeType: book.mimeType
    }));
  }

  if (mobileShelfTab === 'local' || !navigator.onLine) {
    const offlineIds = new Set(readOfflineBookIndex().map(b => b.id));
    visibleBooks = visibleBooks.filter(book => offlineIds.has(book.id));
  }
  const needle = mobileShelfSearchText.trim().toLocaleLowerCase();
  if (needle) {
    visibleFolders = visibleFolders.filter(f => f.name.toLocaleLowerCase().includes(needle));
    visibleBooks = visibleBooks.filter(b => b.name.toLocaleLowerCase().includes(needle));
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, {numeric:true});
  visibleFolders.sort(byName);
  visibleBooks.sort(byName);
  return {visibleFolders, visibleBooks};
}

function createMobileBookshelf() {
  if (mobileShelfRoot || !shouldShowMobileShelf()) return;
  const style = document.createElement('style');
  style.id = 'mobileShelfStyle';
  style.textContent = `
  #mobileBookshelf {display:none}
  @media(max-width:800px) {
    #mobileBookshelf {
      position:fixed; inset:0; z-index:90; display:none; overflow:hidden;
      background:#faf9f7; color:#302a25; font-family:system-ui,-apple-system,'Noto Sans SC',sans-serif;
      --shelf-accent:#bb4a41; --shelf-header:#795548;
    }
    #mobileBookshelf.is-visible {display:flex;flex-direction:column}
    #mobileBookshelf button, #mobileBookshelf input {font:inherit}
    #mobileBookshelf .shelf-top {background:var(--shelf-header); color:#fff; flex-shrink:0; padding-top:env(safe-area-inset-top,0px)}
    #mobileBookshelf .shelf-navigation {height:64px;display:flex;align-items:center;padding:0 15px;gap:10px}
    #mobileBookshelf .shelf-page-title {font-size:21px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #mobileBookshelf .shelf-icon {border:0;color:inherit;background:transparent;min-width:42px;min-height:44px;border-radius:10px;font-size:24px;cursor:pointer}
    #mobileBookshelf .shelf-icon:active {background:#ffffff25}
    #mobileBookshelf .shelf-tabs {display:flex;gap:32px;padding:0 24px;height:54px;align-items:stretch}
    #mobileBookshelf .shelf-tab {background:none;color:#fff9;border:0;border-bottom:3px solid transparent;padding:0 2px;font-size:16px}
    #mobileBookshelf .shelf-tab.active {color:#fff;border-color:#f46d64}
    #mobileBookshelf .shelf-search {margin:0 16px 12px;width:calc(100% - 32px);border-radius:9px;padding:11px 12px;border:0;outline:none;display:none;background:#fff;color:#333}
    #mobileBookshelf .shelf-search.active {display:block}
    #mobileBookshelf .shelf-list {flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;background:#faf9f7;padding-bottom:24px}
    #mobileBookshelf .shelf-breadcrumb {display:flex;gap:5px;align-items:center;padding:14px 14px 8px;color:#88786d;flex-wrap:wrap;font-size:13px}
    #mobileBookshelf .shelf-breadcrumb button {background:none;border:0;color:inherit;padding:4px 5px}
    #mobileBookshelf .shelf-section-label {padding:14px 20px 8px;font-size:12px;color:#8a847e;font-weight:700;letter-spacing:.03em}
    #mobileBookshelf .shelf-folder-row {display:flex;align-items:center;gap:12px;padding:12px 16px;min-height:68px;background:white;border-bottom:1px solid #eceae7}
    #mobileBookshelf .shelf-folder-open {border:0;display:flex;flex:1;align-items:center;text-align:left;gap:15px;background:none;min-width:0;color:#282828}
    #mobileBookshelf .shelf-folder-open .folder-symbol {display:grid;place-items:center;width:49px;height:45px;color:#b28a4c;background:#f8edd8;border-radius:12px;font-size:26px}
    #mobileBookshelf .shelf-folder-open .folder-name {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:600}
    #mobileBookshelf .shelf-item-menu {background:none;border:0;min-width:35px;height:44px;color:#8c8885;font-size:23px}
    #mobileBookshelf .shelf-book-row {display:flex;align-items:center;gap:12px;padding:14px 16px;background:#faf9f7;border-bottom:1px solid #eeeae7;min-height:146px}
    #mobileBookshelf .shelf-cover {width:90px;height:121px;flex-shrink:0;border:1px solid #bdb8af;border-radius:3px;box-shadow:2px 2px 5px #0002,inset 3px 0 0 #8a786553;background:linear-gradient(135deg,#fffdf9,#eee9de);position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden}
    #mobileBookshelf .shelf-cover::after {content:' ';position:absolute;inset:6px;border:1px solid #bdaaa157;pointer-events:none}
    #mobileBookshelf .shelf-cover-title {writing-mode:vertical-rl;max-height:102px;max-width:72px;overflow:hidden;word-break:break-all;font-size:13px;color:#9d453b;font-weight:750;line-height:1.5}
    #mobileBookshelf .shelf-book-open {border:0;background:none;color:inherit;text-align:left;flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:9px;min-height:118px}
    #mobileBookshelf .shelf-book-title {font-size:18px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all;color:#252525}
    #mobileBookshelf .shelf-book-meta {font-size:13px;color:#8c8985;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #mobileBookshelf .shelf-offline-tag {font-size:12px;color:#568b64;background:#e4f3e7;border-radius:99px;padding:3px 7px;align-self:flex-start}
    #mobileBookshelf .shelf-bottom {padding-bottom:env(safe-area-inset-bottom,0px);height:66px;box-sizing:content-box;flex-shrink:0;background:#f3f2f0;border-top:1px solid #ddd8d3;display:flex;align-items:center;justify-content:space-around}
    #mobileBookshelf .shelf-bottom button {border:0;background:none;color:#706b67;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;font-size:11px;min-width:80px}
    #mobileBookshelf .shelf-bottom button span {font-size:22px;line-height:1.1}
    #mobileBookshelf .shelf-bottom button.active {color:#c1483e;font-weight:700}
    #mobileBookshelf .shelf-empty {padding:42px 25px;text-align:center;line-height:1.7;color:#777}
    #mobileShelfDialog {position:fixed;inset:0;z-index:501;background:#0006;display:flex;align-items:flex-end}
    #mobileShelfDialog .shelf-dialog-sheet {background:#fff;color:#302a25;width:100%;max-height:77dvh;overflow-y:auto;border-radius:18px 18px 0 0;padding:20px 17px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -6px 22px #0002}
    #mobileShelfDialog .shelf-dialog-title {font-weight:750;font-size:17px;margin-bottom:15px;word-break:break-all}
    #mobileShelfDialog .shelf-dialog-option {width:100%;border:0;background:#fff;padding:15px 8px;text-align:left;border-bottom:1px solid #eee;color:#333}
    #mobileShelfDialog .shelf-dialog-close {margin-top:12px;border:0;background:#eee;border-radius:10px;padding:13px;width:100%;color:#333}
  }
  `;
  document.head.appendChild(style);

  mobileShelfRoot = document.createElement('section');
  mobileShelfRoot.id = 'mobileBookshelf';
  mobileShelfRoot.setAttribute('aria-label','내 서재');
  mobileShelfRoot.innerHTML = `
    <header class="shelf-top">
      <div class="shelf-navigation">
        <button class="shelf-icon" id="shelfBack" title="상위 폴더">‹</button>
        <div class="shelf-page-title" id="shelfTitle">내 서재</div>
        <button class="shelf-icon" id="shelfSearchBtn" aria-label="검색">⌕</button>
        <button class="shelf-icon" id="shelfMoreBtn" aria-label="더보기">⋮</button>
      </div>
      <nav class="shelf-tabs">
        <button class="shelf-tab active" id="shelfAllTab">전체</button>
        <button class="shelf-tab" id="shelfOfflineTab">오프라인</button>
      </nav>
      <input class="shelf-search" id="shelfSearchInput" placeholder="현재 폴더에서 책이나 폴더 검색" type="search" />
    </header>
    <div class="shelf-list" id="shelfListing"></div>
    <nav class="shelf-bottom">
      <button id="shelfBottomBooks" class="active"><span>▤</span>서재</button>
      <button id="shelfBottomOffline"><span>↓</span>오프라인</button>
      <button id="shelfBottomSettings"><span>⚙</span>설정</button>
    </nav>
  `;
  document.body.appendChild(mobileShelfRoot);
  const byId = id => mobileShelfRoot.querySelector('#' + id);
  byId('shelfBack').addEventListener('click', () => navigateShelfParent());
  byId('shelfSearchBtn').addEventListener('click', () => {
    mobileShelfSearchOpen = !mobileShelfSearchOpen;
    byId('shelfSearchInput').classList.toggle('active', mobileShelfSearchOpen);
    if (mobileShelfSearchOpen) byId('shelfSearchInput').focus();
    else { mobileShelfSearchText=''; byId('shelfSearchInput').value=''; renderMobileBookshelf(); }
  });
  byId('shelfSearchInput').addEventListener('input', e => {
    mobileShelfSearchText = e.target.value || '';
    renderMobileBookshelf();
  });
  byId('shelfAllTab').addEventListener('click', () => setMobileShelfTab('all'));
  byId('shelfOfflineTab').addEventListener('click', () => setMobileShelfTab('local'));
  byId('shelfBottomBooks').addEventListener('click', () => {
    setMobileShelfTab('all');
    void navigateShelfTo(libraryFolderId || currentFolderId || '', []);
  });
  byId('shelfBottomOffline').addEventListener('click', () => setMobileShelfTab('local'));
  byId('shelfBottomSettings').addEventListener('click', () => openSettings());
  byId('shelfMoreBtn').addEventListener('click', showMobileShelfMainMenu);
  window.addEventListener('popstate', () => {
    if (shouldShowMobileShelf() && !mobileShelfIsOpen) {
      mobileShelfBackMarker = false;
      showMobileBookshelf();
    }
  });
  window.addEventListener('online', () => {
    if (mobileShelfIsOpen && libraryFolderId) {
      void loadBooks().catch(error => console.warn('서재 온라인 갱신 실패', error));
    }
  });
  mobileShelfIsOpen = true;
  mobileShelfRoot.classList.add('is-visible');
  renderMobileBookshelf();
}

function hideMobileBookshelf() {
  if (!mobileShelfRoot) return;
  mobileShelfIsOpen = false;
  mobileShelfRoot.classList.remove('is-visible');
}

function showMobileBookshelf() {
  if (!shouldShowMobileShelf()) return;
  createMobileBookshelf();
  mobileShelfIsOpen = true;
  mobileShelfRoot.classList.add('is-visible');
  closeMobileMenu();
  renderMobileBookshelf();
  // No book parsing or remote requests just to display the home screen.
}

function setMobileShelfTab(tab) {
  mobileShelfTab = tab;
  renderMobileBookshelf();
}

function mobileShelfProgress(book) {
  const txt = readerState.txtProgress?.[book.id];
  if (txt && Number.isFinite(Number(txt.chapterIndex))) {
    return `이어 읽기 · ${Number(txt.chapterIndex) + 1}장`;
  }
  if (readerState.epubProgress?.[book.id]?.cfi) return '이어 읽기 · 마지막 위치';
  return '아직 읽지 않음';
}

function shelfMakeNode(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className=className;
  if (text != null) el.textContent=String(text);
  return el;
}

function renderMobileBookshelf() {
  if (!mobileShelfRoot || !shouldShowMobileShelf()) return;
  const byId = id => mobileShelfRoot.querySelector('#' + id);
  const activeName = folderPath.length ? folderPath[folderPath.length-1].name : '내 서재';
  byId('shelfTitle').textContent=activeName;
  byId('shelfBack').style.visibility=folderPath.length ? 'visible' : 'hidden';
  byId('shelfAllTab').classList.toggle('active', mobileShelfTab==='all');
  byId('shelfOfflineTab').classList.toggle('active', mobileShelfTab==='local');
  byId('shelfBottomBooks').classList.toggle('active', mobileShelfTab==='all');
  byId('shelfBottomOffline').classList.toggle('active', mobileShelfTab==='local');
  const list = byId('shelfListing');
  list.replaceChildren();

  const crumbs = shelfMakeNode('div','shelf-breadcrumb');
  const home = shelfMakeNode('button','', '내 서재');
  home.onclick=() => void navigateShelfTo(libraryFolderId || '', []);
  crumbs.appendChild(home);
  folderPath.forEach((part,i) => {
    const crumb=shelfMakeNode('button','', '› '+part.name);
    crumb.onclick=() => void navigateShelfTo(part.id,folderPath.slice(0,i+1));
    crumbs.appendChild(crumb);
  });
  list.appendChild(crumbs);

  if (mobileShelfLoading) {
    list.appendChild(shelfMakeNode('div','shelf-empty','폴더를 불러오는 중...'));
    return;
  }
  const {visibleFolders,visibleBooks} = mobileShelfVisibleItems();
  const offlineIds = new Set(readOfflineBookIndex().map(b => b.id));
  if (!visibleFolders.length && !visibleBooks.length) {
    const message = !navigator.onLine
      ? '현재 폴더에서 오프라인 저장한 책을 찾지 못했습니다.\n인터넷 연결 상태에서 책을 저장하면 여기서 읽을 수 있어요.'
      : !accessToken && !readMobileShelfFolderCache(currentFolderId)
        ? 'Google Drive를 연결하면 폴더와 책 목록이 나타납니다.\n오른쪽 위 ⋮ 메뉴에서 연결해 주세요.'
        : '이 폴더에는 표시할 책이 없습니다.';
    const blank=shelfMakeNode('div','shelf-empty',message);
    blank.style.whiteSpace='pre-line';list.appendChild(blank);
  }
  if (visibleFolders.length) {
    list.appendChild(shelfMakeNode('div','shelf-section-label',`폴더 · ${visibleFolders.length}`));
    visibleFolders.forEach(folder => {
      const row=shelfMakeNode('div','shelf-folder-row');
      const open=shelfMakeNode('button','shelf-folder-open');
      open.type='button';
      open.append(shelfMakeNode('span','folder-symbol','📁'), shelfMakeNode('span','folder-name',folder.name));
      open.addEventListener('click',() => void navigateShelfTo(folder.id,[...folderPath,{id:folder.id,name:folder.name}]));
      const menu=shelfMakeNode('button','shelf-item-menu','⋮');
      menu.type='button';menu.setAttribute('aria-label',folder.name+' 관리');
      menu.onclick=() => showMobileShelfFileMenu(folder,true);
      row.append(open,menu);list.appendChild(row);
    });
  }
  if (visibleBooks.length) {
    list.appendChild(shelfMakeNode('div','shelf-section-label',`소설 · ${visibleBooks.length}`));
    visibleBooks.forEach(book => {
      const row=shelfMakeNode('div','shelf-book-row');
      const cover=shelfMakeNode('div','shelf-cover');
      const rawTitle=book.name.replace(/\.(txt|epub)$/i,'');
      cover.appendChild(shelfMakeNode('span','shelf-cover-title',rawTitle));
      const open=shelfMakeNode('button','shelf-book-open');open.type='button';
      open.appendChild(shelfMakeNode('span','shelf-book-title',rawTitle));
      open.appendChild(shelfMakeNode('span','shelf-book-meta',mobileShelfProgress(book)));
      if(offlineIds.has(book.id)) open.appendChild(shelfMakeNode('span','shelf-offline-tag','✓ 오프라인 저장됨'));
      open.onclick=() => void openMobileShelfBook(book);
      const menu=shelfMakeNode('button','shelf-item-menu','⋮');
      menu.type='button';menu.setAttribute('aria-label',book.name+' 관리');
      menu.onclick=()=>showMobileShelfFileMenu(book,false);
      row.append(cover,open,menu);list.appendChild(row);
    });
  }
}

async function navigateShelfTo(folderId,path) {
  if (!shouldShowMobileShelf()) return;
  const dest=folderId || libraryFolderId || '';
  const goingToExisting = currentFolderId===dest && JSON.stringify(folderPath)===JSON.stringify(path);
  folderPath=path;
  currentFolderId=dest;
  mobileShelfSearchText='';
  const search=mobileShelfRoot?.querySelector('#shelfSearchInput');
  if(search) search.value='';
  if (!navigator.onLine || !accessToken || !libraryFolderId) {
    mobileShelfLoading=false;
    renderMobileBookshelf();
    return;
  }
  if (goingToExisting && readMobileShelfFolderCache(dest)) {
    renderMobileBookshelf();
    return;
  }
  mobileShelfLoading=true;renderMobileBookshelf();
  try { await loadBooks(); }
  catch (error) { console.error('폴더 열기 실패',error); alert('폴더를 열 수 없습니다: '+error.message); }
  finally { mobileShelfLoading=false;renderMobileBookshelf(); }
}

function navigateShelfParent() {
  const parent=folderPath.slice(0,-1);
  void navigateShelfTo(parent.length?parent[parent.length-1].id:libraryFolderId,parent);
}

async function openMobileShelfBook(book) {
  if (!hasOfflineBook(book.id) && (!navigator.onLine || !accessToken)) {
    alert('이 책은 기기에 저장되어 있지 않습니다. 인터넷 연결과 Google Drive 연결이 필요합니다.');
    return;
  }
  if (selectedBook?.id===book.id &&
      (!txtReader.classList.contains('hidden') || !epubReader.classList.contains('hidden'))) {
    hideMobileBookshelf();
    return;
  }
  hideMobileBookshelf();
  // Keep Android back navigation inside the PWA.
  if (!mobileShelfBackMarker) {
    history.pushState({novelReader:'reading'}, '', location.href);
    mobileShelfBackMarker=true;
  }
  try { await openBook(book); }
  catch (error) {
    showMobileBookshelf();
    console.error('소설 열기 실패',error);
    alert('소설을 열 수 없습니다: '+error.message);
  }
}

function closeMobileShelfDialog() {
  if (mobileShelfDialog) mobileShelfDialog.remove();
  mobileShelfDialog=null;
}

function openMobileShelfDialog(title,options) {
  closeMobileShelfDialog();
  const backdrop=shelfMakeNode('div','');backdrop.id='mobileShelfDialog';
  const sheet=shelfMakeNode('div','shelf-dialog-sheet');
  sheet.appendChild(shelfMakeNode('div','shelf-dialog-title',title));
  options.forEach(option => {
    const btn=shelfMakeNode('button','shelf-dialog-option',option.label);
    btn.type='button';btn.addEventListener('click',()=>{
      closeMobileShelfDialog();
      void Promise.resolve().then(option.action).catch(err=>{
        console.error(err);alert('작업 실패: '+err.message);
      });
    });
    sheet.appendChild(btn);
  });
  const close=shelfMakeNode('button','shelf-dialog-close','취소');
  close.onclick=closeMobileShelfDialog;
  sheet.appendChild(close);
  backdrop.appendChild(sheet);
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeMobileShelfDialog();});
  document.body.appendChild(backdrop);
  mobileShelfDialog=backdrop;
}

function showMobileShelfFileMenu(item,isFolder) {
  openMobileShelfDialog(item.name,[
    ...(!isFolder?[{label:'📖 이어서 읽기',action:()=>openMobileShelfBook(item)}]:[]),
    {label:'✎ 이름 변경',action:()=>driveRename(item)},
    {label:'📂 다른 폴더로 이동',action:()=>showMobileShelfMoveTargets(item,isFolder)}
  ]);
}

async function showMobileShelfMoveTargets(item,isFolder) {
  if (!navigator.onLine || !accessToken) {
    alert('파일 이동은 Google Drive 연결이 필요합니다.');return;
  }
  // Explicit move action only: scanning nested destinations at app startup
  // would slow the reader down.
  const destinations=[{id:libraryFolderId,name:'내 서재 (최상위)',depth:0},
    ...await listAllFolders(libraryFolderId)];
  const prohibited=new Set([item.id]);
  if (isFolder) (await listAllFolders(item.id)).forEach(f=>prohibited.add(f.id));
  openMobileShelfDialog('이동할 폴더를 선택하세요',destinations
    .filter(d=>!prohibited.has(d.id))
    .map(dest=>({
      label:'　'.repeat(Math.min(8,dest.depth))+'📁 '+dest.name,
      action: async()=>{
        const parentId=(item.parents || [currentFolderId])[0];
        if(dest.id===parentId)return;
        const p=new URLSearchParams({addParents:dest.id,fields:'id,name,parents'});
        if(parentId)p.set('removeParents',parentId);
        await apiFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id)+'?'+p,{method:'PATCH'});
        await loadBooks();
        alert('선택한 폴더로 이동했습니다.');
      }
    })));
}

function showMobileShelfMainMenu() {
  openMobileShelfDialog('내 서재 관리',[
    {label:'📁 현재 위치에 새 폴더 만들기',action:()=>createLibraryFolder()},
    {label:'↑ 현재 위치에 TXT/EPUB 업로드',action:()=>fileInput.click()},
    {label:'⟳ 이 폴더 새로고침',action:async()=>{
      if(!accessToken){alert('Google Drive를 연결해 주세요.');return;}
      await loadBooks();
    }},
    {label:'☁ Google Drive 연결',action:()=>connectGoogleDrive()},
    {label:'⚙ 읽기 설정',action:()=>openSettings()}
  ]);
}

// Create the shelf immediately, rather than waiting for OAuth or downloading
// an entire TXT novel. Mobile starts at the library, desktop stays unchanged.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded',createMobileBookshelf,{once:true});
} else {
  createMobileBookshelf();
}

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
    contentWidth: 850
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

  applySettings();

  waitForGoogle();

});


function waitForGoogle() {

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

    libraryFolderId =
      await ensureLibraryFolder();

    await loadState();

    applySettings();

    await loadBooks();

    loginStatus.textContent =
      "Google Drive 연결됨";

    googleLoginBtn.textContent =
      "✓ Google Drive 연결됨";


    localStorage.setItem(
      GOOGLE_CONNECTED_KEY,
      "1"
    );


    if (
      readerState.lastOpenedBookId
    ) {

      const book =
        books.find(
          b =>
            b.id ===
            readerState.lastOpenedBookId
        );

      if (book) {

        await openBook(book);

      }

    }

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


    libraryFolderId =
      await ensureLibraryFolder();


    await loadState();


    applySettings();


    await loadBooks();


    loginStatus.textContent =
      "Google Drive 연결됨";

    googleLoginBtn.textContent =
      "✓ Google Drive 연결됨";


    if (
      readerState.lastOpenedBookId
    ) {

      const book =
        books.find(
          b =>
            b.id ===
            readerState.lastOpenedBookId
        );


      if (book) {

        await openBook(book);

      }

    }

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
  const items = await driveListChildren(currentFolderId);
  folders = items.filter(item => item.mimeType === "application/vnd.google-apps.folder");
  books = items.filter(item => item.mimeType !== "application/vnd.google-apps.folder" && /\.(txt|epub)$/i.test(item.name));
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

  if (isMobilePagedReading() && isMobileTxtBook()) {
    requestAnimationFrame(() =>
      finishMobileTxtRender(readerState.txtProgress[book.id]?.pageRatio ??
        readerState.txtProgress[book.id]?.scrollRatio ?? 0));
  }

  resetAutoDisguiseTimer();

}


/* =========================================================
   Drive 파일 다운로드
========================================================= */

async function downloadDriveFile(
  fileId
) {

  const response =
    await apiFetch(

      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`

    );


  return response;

}


/* =========================================================
   TXT 열기
========================================================= */

async function openTxtBook(book) {

  destroyEpub();


  const response =
    await downloadDriveFile(
      book.id
    );


  const text =
    await response.text();


  txtChapters =
    splitTxtIntoChapters(
      text
    );

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


  txtContent.textContent =
    chapter.content;


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


          if (isMobilePagedReading()) {
            finishMobileTxtRender(restoreRatio);
          } else {
            txtScrollArea.scrollTop = max > 0 ?
              max * restoreRatio : 0;
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

  if (isMobilePagedReading() && isMobileTxtBook()) {
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

  clearTimeout(
    stateSaveTimer
  );


  stateSaveTimer =
    setTimeout(
      saveState,
      1000
    );

}


/* =========================================================
   appData 상태 읽기
========================================================= */

async function loadState() {

  try {

    const query =
      encodeURIComponent(

        `name='${STATE_FILE_NAME}' and trashed=false`

      );


    const response =
      await apiFetch(

        "https://www.googleapis.com/drive/v3/files" +
        "?spaces=appDataFolder" +
        `&q=${query}` +
        "&fields=files(id,name)"

      );


    const data =
      await response.json();


    if (
      !data.files ||
      data.files.length === 0
    ) {

      stateFileId = "";

      return;

    }


    stateFileId =
      data.files[0].id;


    const stateResponse =
      await apiFetch(

        `https://www.googleapis.com/drive/v3/files/${stateFileId}?alt=media`

      );


    const text =
      await stateResponse.text();


    const parsed =
      JSON.parse(text);


    readerState = {

      settings: {

        theme:
          parsed.settings
            ?.theme ||
          "sepia",

        fontSize:
          parsed.settings
            ?.fontSize ||
          20,

        lineHeight:
          parsed.settings
            ?.lineHeight ||
          1.9,

        contentWidth:
          parsed.settings
            ?.contentWidth ||
          850

      },

      lastOpenedBookId:
        parsed.lastOpenedBookId ||
        null,

      txtProgress:
        parsed.txtProgress ||
        {},

      epubProgress:
        parsed.epubProgress ||
        {}

    };

  }

  catch (error) {

    console.error(
      "상태 불러오기 실패",
      error
    );

  }

}


/* =========================================================
   appData 상태 저장
========================================================= */

async function saveState() {

  if (!accessToken) {
    return;
  }


  try {

    const blob =
      new Blob(

        [

          JSON.stringify(
            readerState,
            null,
            2
          )

        ],

        {

          type:
            "application/json"

        }

      );


    const metadata =
      stateFileId

        ?

        {

          name:
            STATE_FILE_NAME

        }

        :

        {

          name:
            STATE_FILE_NAME,

          parents: [
            "appDataFolder"
          ]

        };


    const result =
      await multipartUpload(

        metadata,

        blob,

        stateFileId || null

      );


    if (!stateFileId) {

      stateFileId =
        result.id;

    }

  }

  catch (error) {

    console.error(
      "상태 저장 실패",
      error
    );

  }

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
  pageTurning: false
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
  ui.dataset.readerVersion = 'v6-bookflip';
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
    sidebar.classList.add('open');
    overlay.classList.remove('hidden');
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
    if (!isMobilePagedReading()) return;
    clearTimeout(mobilePageState.resizeTimer);
    mobilePageState.resizeTimer = setTimeout(() => {
      if (isMobileTxtBook()) {
        renderTxtChapter(mobilePageState.txtPages <= 1 ? 0 :
          mobilePageState.txtPageIndex / (mobilePageState.txtPages - 1));
      } else {
        epubRendition?.resize();
        updateMobileProgressDisplay();
      }
    }, 180);
  });
}

function prepareMobilePagedBook() {
  mobilePageState.pageTurning = false;
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
  if (visible) updateMobileProgressDisplay();
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
  if (!isMobilePagedReading() || !isMobileTxtBook()) return;
  const pageCount = getMobileTxtPageCount();
  mobilePageState.txtPages = pageCount;
  mobilePageState.txtPageIndex = Math.min(pageCount - 1,
    Math.max(0, Math.round(ratio * (pageCount - 1))));
  txtScrollArea.scrollLeft = mobilePageState.txtPageIndex * getMobileTxtPageStride();
  txtScrollArea.scrollTop = 0;
  updateMobileProgressDisplay();
}

function rememberMobileTxtProgress() {
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
    label = `${currentTxtChapter + 1}/${txtChapters.length}장 · ` +
      `${mobilePageState.txtPageIndex + 1}/${mobilePageState.txtPages}페이지 · 전체 ${Math.round(percent*100)}%`;
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
  return new Promise(resolve => requestAnimationFrame(resolve));
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
    // 기존 페이지를 별도로 복제해 넘기는 도중 글자가 유지되게 합니다.
    const clone = txtScrollArea.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.cssText = '';
    Object.assign(clone.style, {
      position:'absolute', inset:'0', width:'100%', height:'100%',
      overflow:'hidden', background:surfaceColor,
      margin:'0', padding:'0', pointerEvents:'none', flex:'none',
      display:'block', touchAction:'none', scrollbarWidth:'none'
    });
    const originalText = txtContent;
    const textClone = clone.firstElementChild;
    if (textClone) {
      textClone.removeAttribute('id');
      const computed = getComputedStyle(originalText);
      const props = ['box-sizing','font-size','font-family','font-weight','line-height',
        'letter-spacing','color','white-space','overflow-wrap','word-break',
        'text-align','text-indent','column-width','column-gap','column-fill'];
      props.forEach(p => textClone.style.setProperty(p, computed.getPropertyValue(p)));
      Object.assign(textClone.style, {
        margin:'0 16px', width:`${Math.max(1,rect.width-32)}px`,
        minWidth:`${Math.max(1,rect.width-32)}px`,
        height:`${rect.height}px`, maxHeight:`${rect.height}px`,
        padding:'22px 0 36px',
        columnWidth:`${Math.max(1,rect.width-32)}px`,
        columnGap:'32px', columnFill:'auto',
        boxSizing:'border-box', whiteSpace:'pre-wrap'
      });
    }
    paper.appendChild(clone);
    // clone의 scrollLeft는 DOM에 붙인 뒤 계산해야 적용됩니다.
    stage._copyScroll = () => { clone.scrollLeft = txtScrollArea.scrollLeft; };
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
  document.body.appendChild(stage);
  stage._paper = paper;
  stage._shade = shade;
  stage._copyScroll?.();
  return stage;
}

async function animateMobilePageFlip(direction, kind, performTurn) {
  if (!mobilePageMotionEnabled()) {
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
  if (!isMobilePagedReading() || mobilePageState.pageTurning) return;
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
    if (low !== currentTxtChapter) moveTxtChapter(low, within);
    else {
      finishMobileTxtRender(within);
      rememberMobileTxtProgress();
    }
  } else {
    try {
      const locations = epubBook?.locations;
      if (!mobilePageState.epubLocationsReady || !locations) {
        mobilePageState.progressLabel.textContent = 'EPUB 위치 계산 중... 잠시 후 다시 시도하세요';
        return;
      }
      const cfi = locations.cfiFromPercentage(target);
      if (cfi) await epubRendition?.display(cfi);
    } catch (error) {
      console.warn('EPUB 이동 실패', error);
    }
  }
  updateMobileProgressDisplay();
}

function bindMobilePageGestures(target, ownerDocument) {
  if (!target || target.__mobilePageGesturesBound) return;
  target.__mobilePageGesturesBound = true;
  let start = null;
  target.addEventListener('pointerdown', event => {
    if (!isMobilePagedReading() || !event.isPrimary || event.button !== 0 ||
        isReadingControlTarget(event.target)) {
      start = null; return;
    }
    start = { id:event.pointerId, x:event.clientX, y:event.clientY, t:Date.now() };
  }, {passive:true});
  target.addEventListener('pointercancel', () => { start = null; }, {passive:true});
  target.addEventListener('pointerup', event => {
    if (!start || start.id !== event.pointerId || !isMobilePagedReading()) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const time = Date.now() - start.t;
    start = null;
    if (time > 900) return;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      turnMobilePage(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12 || time > 600) return;
    if (isReadingControlTarget(event.target)) return;
    const selection = ownerDocument.getSelection?.();
    if (selection && !selection.isCollapsed) return;
    const width = ownerDocument.defaultView?.innerWidth || window.innerWidth;
    const portion = event.clientX / Math.max(1, width);
    if (portion >= .56) turnMobilePage(1);
    else if (portion <= .24) turnMobilePage(-1);
    else toggleMobileReadingControls();
  }, {passive:true});
}

function startMobileEpubLocations(book) {
  if (!isMobilePagedReading() || !book) return;
  book.ready.then(async () => {
    try {
      await book.locations.generate(1500);
      if (epubBook !== book) return;
      mobilePageState.epubLocationsReady = true;
      mobilePageState.epubLocationBook = book;
      updateMobileProgressDisplay();
    } catch (error) {
      console.warn('EPUB 진행 위치 계산 실패', error);
    }
  });
}

initializeMobilePagedReading();
document.documentElement.dataset.readerBuild = 'v6-bookflip';

/* =========================================================
   PWA 설치 및 폴더 관리 스타일
========================================================= */
(function initializeReaderPwa() {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = isMobileReaderDevice()
    ? "./manifest-android.webmanifest?v=6"
    : "./manifest.webmanifest?v=6";
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
      navigator.serviceWorker.register("./sw.js?v=6").then(reg => {
        reg.update().catch(() => {});
        // 강제로 캐시를 삭제하지 않고 새 서비스 워커 활성화 후 한 번만 다시 읽습니다.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (sessionStorage.getItem('reader-v6-updated') !== '1') {
            sessionStorage.setItem('reader-v6-updated','1');
            location.reload();
          }
        });
      }).catch(error => console.warn("PWA 등록 실패", error));
    });
  }
})();

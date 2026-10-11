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
    progress.scrollRatio || 0
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


          txtScrollArea.scrollTop =
            max > 0
              ? max * restoreRatio
              : 0;

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
  index
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

      scrollRatio: 0

    };


  renderTxtChapter(0);


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

        flow:
          "scrolled-doc"

      }

    );


  const progress =
    readerState
      .epubProgress[
        book.id
      ] || {};


  await epubRendition.display(
    progress.cfi || undefined
  );


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
   PWA 설치 및 폴더 관리 스타일
========================================================= */
(function initializeReaderPwa() {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "./manifest.webmanifest";
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
      navigator.serviceWorker.register("./sw.js").catch(error => console.warn("PWA 등록 실패", error));
    });
  }
})();
